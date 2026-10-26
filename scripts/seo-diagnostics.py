#!/usr/bin/env python3
"""Read-only public-edge and server diagnostics. Never prints raw nginx dumps or env files."""

import argparse
import datetime
import fnmatch
import http.client
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import ssl
import subprocess
import sys
from urllib.parse import urljoin, urlsplit, urlunsplit

SITE = "https://www.zsaki.icu"
APEX = "https://zsaki.icu"
PROJECT = "songdian-b2b"


def report(mode):
    return {"schema": 1, "mode": mode, "read_only": True,
            "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "errors": [], "warnings": []}


def issue(result, code, message, warning=False):
    result["warnings" if warning else "errors"].append({"code": code, "message": message})


def safe_url(value):
    """Redirects can contain arbitrary query credentials; retain only our public probe query."""
    try:
        parts = urlsplit(value)
        if parts.username or parts.password:
            return "[URL with user information withheld]"
        query = parts.query if parts.query == "category=compact-camera" else ("[redacted]" if parts.query else "")
        return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))[:2048]
    except ValueError:
        return "[invalid URL]"


def request(url):
    parts = urlsplit(url)
    connection_class = http.client.HTTPSConnection if parts.scheme == "https" else http.client.HTTPConnection
    options = {"timeout": 12}
    if parts.scheme == "https":
        options["context"] = ssl.create_default_context()
    connection = connection_class(parts.hostname, parts.port, **options)
    try:
        connection.request("GET", urlunsplit(("", "", parts.path or "/", parts.query, "")),
                           headers={"User-Agent": "Songdian-SEO-Diagnostics/1.0"})
        response = connection.getresponse()
        certificate = connection.sock.getpeercert() if parts.scheme == "https" and connection.sock else {}
        return {"status": response.status, "location": response.getheader("Location"),
                "certificate_dns": [value for kind, value in certificate.get("subjectAltName", ()) if kind == "DNS"]}
    finally:
        connection.close()


def trace(start, expected, allowed_hosts, fetch=request):
    result = report("trace")
    result.update({"url": safe_url(start), "expected": safe_url(expected), "hops": []})
    current, visited = start, set()
    for _ in range(6):
        if current in visited:
            issue(result, "redirect_loop", "The redirect chain contains a loop.")
            break
        visited.add(current)
        try:
            parts = urlsplit(current)
            allowed = (parts.scheme in ("http", "https") and parts.hostname in allowed_hosts
                       and not parts.username and not parts.password and parts.port in (None, 80, 443))
        except ValueError:
            allowed = False
        if not allowed:
            issue(result, "unexpected_destination", "Redirect left the expected public origins; no request was made to that destination.")
            break
        try:
            response = fetch(current)
        except (ssl.SSLError, OSError, http.client.HTTPException, ValueError) as error:
            code = "tls_verification_failed" if isinstance(error, ssl.SSLCertVerificationError) else "request_failed"
            issue(result, code, "TLS certificate validation failed." if code.startswith("tls") else "Public request failed or timed out.")
            result["hops"].append({"url": safe_url(current), "error_type": type(error).__name__})
            break
        location = response.get("location")
        result["hops"].append({"url": safe_url(current), "status": response["status"],
                               "location": safe_url(location) if location else None,
                               "certificate_dns": response.get("certificate_dns", [])})
        if response["status"] in (301, 302, 303, 307, 308):
            if not location or len(location) > 4096:
                issue(result, "invalid_location", "Redirect Location is missing or oversized.")
                break
            if response["status"] not in (301, 308):
                issue(result, "temporary_redirect", "Canonical host/path redirect should be permanent.")
            try:
                current = urljoin(current, location)
                if "//" in urlsplit(current).path:
                    issue(result, "repeated_slash", "The redirect target contains repeated path slashes.")
            except ValueError:
                issue(result, "invalid_location", "Redirect Location is invalid.")
                break
            continue
        if response["status"] != 200 or current != expected:
            issue(result, "wrong_final_response", "Final response is not HTTP 200 at the exact expected URL (including path and query).")
        if start != expected and len(result["hops"]) == 1:
            issue(result, "missing_redirect", "An alternate origin/path is serving content without redirecting to the canonical URL.")
        if len(result["hops"]) > 2:
            issue(result, "extra_redirects", "The chain reaches the canonical URL through more than one redirect.", warning=True)
        break
    else:
        issue(result, "redirect_limit", "More than five redirects were required.")
    return result


def public_report():
    result = report("public")
    probe = "/products?category=compact-camera"
    cases = [(SITE + "/", SITE + "/"), (APEX + "/", SITE + "/"),
             (APEX.replace("https:", "http:") + "/", SITE + "/"),
             (SITE.replace("https:", "http:") + "/", SITE + "/"),
             (SITE + "//", SITE + "/"), (APEX.replace("https:", "http:") + probe, SITE + probe)]
    result["checks"] = [trace(start, expected, {urlsplit(SITE).hostname, urlsplit(APEX).hostname})
                        for start, expected in cases]
    for check in result["checks"]:
        for severity in ("errors", "warnings"):
            result[severity].extend({**item, "url": check["url"]} for item in check[severity])
    return result


def command(args, timeout=15):
    """Capture locally for allowlisted extraction; never relay command output to CI logs."""
    try:
        process = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                                 encoding="utf-8", errors="replace", check=False)
        return process.returncode, process.stdout, process.stderr
    except (OSError, subprocess.TimeoutExpired):
        return -1, "", ""


def config_files(dump):
    files = {}
    for match in re.finditer(r"^# configuration file ([^\r\n]+):\r?\n([\s\S]*?)(?=^# configuration file |\Z)", dump, re.M):
        files[match[1]] = match[2]
    return files


def directives(text):
    lexer = shlex.shlex(text, posix=True, punctuation_chars="{};")
    lexer.whitespace_split = True
    # Split adjacent structural punctuation, keeping quoted values untouched.
    tokens = []
    for token in lexer:
        tokens.extend(list(token) if re.fullmatch(r"[{};]+", token) else [token])
    position = 0

    def block(nested=False):
        nonlocal position
        nodes, words = [], []
        while position < len(tokens):
            token = tokens[position]
            position += 1
            if token == "}":
                if words or not nested:
                    raise ValueError("unsupported configuration structure")
                return nodes
            if token in (";", "{"):
                if not words:
                    raise ValueError("unsupported configuration structure")
                children = block(True) if token == "{" else []
                nodes.append({"name": words[0], "args": words[1:], "children": children})
                words = []
            else:
                words.append(token)
        if words or nested:
            raise ValueError("incomplete configuration structure")
        return nodes

    return block()


def summarize_nginx(dump, hosts=("zsaki.icu", "www.zsaki.icu")):
    """Summarize selected vhosts and their includes. No raw config or private-key directives escape."""
    files = config_files(dump)
    parsed, unsupported = {}, []
    for filename, text in files.items():
        try:
            parsed[filename] = directives(text)
        except ValueError:
            unsupported.append(filename)
    prefix = str(PurePosixPath(next(iter(files), "/etc/nginx/nginx.conf")).parent)

    def walk(nodes, visited):
        for node in nodes:
            yield node
            if node["name"] == "include":
                for pattern in node["args"]:
                    pattern = pattern if pattern.startswith("/") else prefix + "/" + pattern
                    for filename, children in parsed.items():
                        if fnmatch.fnmatchcase(filename, pattern) and filename not in visited and len(visited) < 50:
                            yield from walk(children, visited | {filename})
            yield from walk(node["children"], visited)

    servers = []
    for filename, nodes in parsed.items():
        # Nginx -T dumps includes separately; inspect actual server blocks, then resolve their includes.
        for server in walk(nodes, set(parsed)):
            if server["name"] != "server" or not server["children"]:
                continue
            entries = list(walk(server["children"], {filename}))
            names = [name for node in entries if node["name"] == "server_name" for name in node["args"]]
            listens = [" ".join(node["args"]) for node in entries if node["name"] == "listen"]
            fallback = "_" in names or any("default_server" in value for value in listens)
            if not any(host in names for host in hosts) and not fallback:
                continue
            servers.append({"source": filename, "server_names": names, "listen": listens,
                            "fallback": fallback,
                            "certificates": list(dict.fromkeys(arg if arg.startswith("/") or "$" in arg else prefix + "/" + arg
                                                              for node in entries if node["name"] == "ssl_certificate" for arg in node["args"])),
                            "redirects": [{"status": node["args"][0], "target": safe_url(node["args"][1])}
                                          for node in entries if node["name"] == "return" and len(node["args"]) == 2
                                          and node["args"][0] in ("301", "302", "303", "307", "308")]})
    return {"files_seen": len(files), "unsupported_files": unsupported, "servers": servers}


def server_report(project_dir=None):
    result = report("server")
    if shutil.which("1pctl"):
        code, output, _ = command(["1pctl", "version"])
        version = re.search(r"\bv?\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*\b", output) if code == 0 else None
        result["panel_version"] = version[0] if version else None
    else:
        result["panel_version"] = None
    if not result["panel_version"]:
        issue(result, "panel_version_unavailable", "1Panel version could not be read with the SSH account.", warning=True)
    code, output, _ = command(["docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}"])
    if code != 0:
        issue(result, "docker_unavailable", "Docker inspection failed. Check the existing deployment account and its Docker permissions.")
        return result
    containers = [dict(zip(("id", "name", "image"), line.split("\t", 2))) for line in output.splitlines() if len(line.split("\t", 2)) == 3]
    openresty = [row for row in containers if "openresty" in (row["name"] + " " + row["image"]).lower()]
    result["openresty"] = [{"name": row["name"], "image": row["image"]} for row in openresty]
    if len(openresty) != 1:
        issue(result, "openresty_ambiguous", "Expected one running OpenResty container; no container was selected automatically.")
    else:
        container = openresty[0]["id"]
        code, dump, _ = command(["docker", "exec", container, "nginx", "-T"], timeout=25)
        result["nginx_config_test_passed"] = code == 0
        if code != 0 or len(dump) > 5_000_000:
            issue(result, "nginx_dump_unavailable", "Nginx configuration test/dump failed or exceeded the diagnostic size limit. Raw output is withheld.")
        else:
            result["nginx"] = summarize_nginx(dump)
            if result["nginx"]["unsupported_files"]:
                issue(result, "nginx_summary_incomplete", "Some configuration syntax could not be summarized; do not infer that missing directives are absent.", warning=True)
            if not result["nginx"]["servers"]:
                issue(result, "target_vhost_not_found", "No exact target-domain or explicit fallback vhost was found in the parsed configuration.")
            certificates = list(dict.fromkeys(path for server in result["nginx"]["servers"] for path in server["certificates"]))
            result["certificates"] = []
            for filename in certificates[:10]:
                certificate = {"path": filename}
                if "$" not in filename:
                    code, text, _ = command(["docker", "exec", container, "openssl", "x509", "-in", filename,
                                             "-noout", "-startdate", "-enddate", "-ext", "subjectAltName"])
                    if code == 0:
                        certificate["dns_names"] = re.findall(r"DNS:([^,\s]+)", text)
                        certificate["dates"] = re.findall(r"^not(?:Before|After)=.+$", text, re.M)
                    else:
                        certificate["details_unavailable"] = True
                else:
                    certificate["details_unavailable"] = True
                result["certificates"].append(certificate)
            if any(item.get("details_unavailable") for item in result["certificates"]):
                issue(result, "certificate_details_unavailable", "Some public certificate SAN/date details could not be read; raw certificate and command output are withheld.", warning=True)
            if len(certificates) > 10:
                issue(result, "certificate_limit", "Only the first ten referenced public certificates were inspected.", warning=True)
    result["applications"] = []
    directories = set()
    for service in ("backend", "frontend", "admin-next"):
        code, ids, _ = command(["docker", "ps", "--filter", "label=com.docker.compose.project=" + PROJECT,
                                "--filter", "label=com.docker.compose.service=" + service, "--format", "{{.ID}}"])
        if code != 0 or len(ids.split()) != 1:
            issue(result, "application_not_identified", "Could not uniquely identify the " + service + " service in the expected Compose project.", warning=True)
            continue
        container = ids.strip()
        template = '{"image":{{json .Config.Image}},"working_dir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}'
        code, details, _ = command(["docker", "inspect", "--format", template, container])
        try:
            app = json.loads(details) if code == 0 else {}
        except json.JSONDecodeError:
            app = {}
        app["service"] = service
        result["applications"].append(app)
        if app.get("working_dir"):
            directories.add(app["working_dir"])
        if service == "frontend":
            code, values, _ = command(["docker", "exec", container, "node", "-e",
                                      'console.log(JSON.stringify({SEO_INDEXABLE:process.env.SEO_INDEXABLE,NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL}))'])
            try:
                public_env = json.loads(values) if code == 0 else {}
                app["public_seo_environment"] = {key: public_env.get(key) for key in ("SEO_INDEXABLE", "NEXT_PUBLIC_SITE_URL")}
            except json.JSONDecodeError:
                issue(result, "public_env_unavailable", "Frontend public SEO variables could not be read.", warning=True)
    resolved = project_dir or (next(iter(directories)) if len(directories) == 1 else None)
    result["project_directory"] = resolved
    if project_dir and directories and project_dir not in directories:
        issue(result, "project_directory_mismatch", "PROD_PATH differs from the running applications' Compose working directory.", warning=True)
    if resolved:
        result["project_directory_exists"] = Path(resolved).is_dir()
        code, revision, _ = command(["git", "-C", resolved, "rev-parse", "HEAD"])
        result["checkout_revision"] = revision.strip() if code == 0 and re.fullmatch(r"[0-9a-f]{40}\s*", revision) else None
    # A checkout SHA is not evidence of the image actually running; images are reported separately.
    return result


def ssh_report(project_dir=None):
    result = report("server")
    host, user = os.environ.get("PROD_HOST", ""), os.environ.get("PROD_USER", "")
    port = os.environ.get("PROD_SSH_PORT", "22")
    valid_host = bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", host))
    try:
        ipaddress.ip_address(host)
        valid_host = True
    except ValueError:
        pass
    if not valid_host or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*", user) or not port.isdecimal() or not 1 <= int(port) <= 65535:
        issue(result, "invalid_ssh_settings", "PROD_HOST, PROD_USER or PROD_SSH_PORT is missing or invalid.")
        return result
    remote = "python3 - --mode server"
    if project_dir:
        remote += " --project-dir " + shlex.quote(project_dir)
    args = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "IdentitiesOnly=yes",
            "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
            "-o", "UserKnownHostsFile=" + str(Path.home() / ".ssh/seo_diagnostics_known_hosts"),
            "-i", str(Path.home() / ".ssh/seo_diagnostics_key"), "-p", port, "-l", user, "--", host, remote]
    process = None
    try:
        process = subprocess.run(args, input=Path(__file__).read_text(encoding="utf-8"), capture_output=True,
                                 text=True, encoding="utf-8", errors="replace", timeout=180, check=False)
        if len(process.stdout) > 5_000_000:
            raise ValueError("oversized report")
        data = json.loads(process.stdout)
        if (not isinstance(data, dict) or data.get("schema") != 1 or data.get("mode") != "server"
                or data.get("read_only") is not True or not isinstance(data.get("errors"), list)
                or not isinstance(data.get("warnings"), list)):
            raise ValueError("invalid report")
        if process.returncode != 0 and not data.get("errors"):
            issue(data, "remote_command_failed", "Remote diagnostic process did not complete successfully.")
        return data
    except (OSError, subprocess.TimeoutExpired, ValueError):
        error = (process.stderr or "").lower() if process else ""
        diagnoses = [
            (("host key verification failed", "remote host identification has changed"), "ssh_host_key_failed", "SSH server identity did not match PROD_KNOWN_HOSTS."),
            (("invalid format", "error in libcrypto", "incorrect passphrase"), "ssh_identity_failed", "The SSH identity format or passphrase is unsupported by this workflow."),
            (("permission denied",), "ssh_authentication_failed", "SSH authentication was denied; verify the deployment user and its authorized public key."),
            (("could not resolve hostname",), "ssh_dns_failed", "The SSH host could not be resolved."),
            (("connection timed out", "connection refused", "no route to host"), "ssh_connection_failed", "The SSH service was unreachable; verify the configured host, port and network access."),
            (("python3: command not found", "python3: not found"), "remote_python_missing", "Python 3 was not found on the server.")]
        code, message = "ssh_diagnostic_failed", "SSH diagnostics failed. Check host keys, identity format, connectivity and Python 3."
        for patterns, candidate, description in diagnoses:
            if any(pattern in error for pattern in patterns):
                code, message = candidate, description
                break
        issue(result, code, message + " Raw SSH output is withheld.")
        return result


def write_report(result, filename=None, summary=None):
    content = json.dumps(result, ensure_ascii=True, indent=2) + "\n"
    if filename:
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        Path(filename).write_text(content, encoding="utf-8")
    else:
        print(content, end="")
    if summary:
        lines = ["### SEO diagnostics: " + result["mode"], "",
                 "Read-only inspection; no configuration, certificates or application data were changed.", "",
                 f"Errors: {len(result['errors'])}; warnings: {len(result['warnings'])}.", ""]
        for severity in ("errors", "warnings"):
            for item in result[severity]:
                lines.append("- **" + severity[:-1] + " / " + item["code"] + "**: " + item["message"])
        lines.extend(["", "See the diagnostic JSON artifact for allowlisted configuration details.", ""])
        Path(summary).parent.mkdir(parents=True, exist_ok=True)
        Path(summary).write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("public", "server", "ssh"), default="public")
    parser.add_argument("--project-dir", help="Optional existing production directory; otherwise detect Compose working_dir")
    parser.add_argument("--report", help="Write sanitized JSON to this local path")
    parser.add_argument("--summary", help="Write a brief Markdown summary to this local path")
    args = parser.parse_args()
    try:
        result = public_report() if args.mode == "public" else (ssh_report(args.project_dir) if args.mode == "ssh" else server_report(args.project_dir))
    except Exception as error:
        result = report("public" if args.mode == "public" else "server")
        issue(result, "diagnostic_incomplete", "Diagnostic inspection could not complete (" + type(error).__name__ + "); raw output is withheld.")
    write_report(result, args.report, args.summary)
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
