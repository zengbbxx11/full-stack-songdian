import importlib.util
import json
import os
from pathlib import Path
import ssl
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("seo_diagnostics", Path(__file__).with_name("seo-diagnostics.py"))
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)


class RedirectDiagnosticsTest(unittest.TestCase):
    def trace(self, responses, start="http://example.com/", expected="https://www.example.com/"):
        calls = []

        def fetch(url):
            calls.append(url)
            response = responses[url]
            if isinstance(response, Exception):
                raise response
            return response

        result = seo.trace(start, expected, {"example.com", "www.example.com"}, fetch)
        return result, calls

    def test_permanent_redirect_preserves_path_and_query(self):
        source = "http://example.com/products?category=compact-camera"
        target = "https://www.example.com/products?category=compact-camera"
        result, calls = self.trace({source: {"status": 301, "location": target}, target: {"status": 200}}, source, target)
        self.assertEqual(result["errors"], [])
        self.assertEqual(calls, [source, target])

    def test_certificate_mismatch_is_not_bypassed(self):
        url = "https://example.com/"
        result, _ = self.trace({url: ssl.SSLCertVerificationError("hostname mismatch")}, url)
        self.assertEqual(result["errors"][0]["code"], "tls_verification_failed")
        self.assertNotIn("status", result["hops"][0])

    def test_repeated_slash_is_reported_even_if_eventually_normalized(self):
        result, _ = self.trace({"http://example.com/": {"status": 301, "location": "https://www.example.com//"},
                                "https://www.example.com//": {"status": 308, "location": "/"},
                                "https://www.example.com/": {"status": 200}})
        self.assertIn("repeated_slash", [item["code"] for item in result["errors"]])

    def test_redirect_loop(self):
        result, _ = self.trace({"http://example.com/": {"status": 301, "location": "http://example.com/"}})
        self.assertEqual(result["errors"][0]["code"], "redirect_loop")

    def test_unexpected_origin_is_never_requested_and_query_is_redacted(self):
        result, calls = self.trace({"http://example.com/": {"status": 302, "location": "https://other.example/?token=SECRET"}})
        self.assertEqual(calls, ["http://example.com/"])
        self.assertIn("unexpected_destination", [item["code"] for item in result["errors"]])
        self.assertNotIn("SECRET", json.dumps(result))

    def test_invalid_port_is_a_trace_error(self):
        result, calls = self.trace({"http://example.com/": {"status": 301, "location": "https://www.example.com:invalid/"}})
        self.assertEqual(calls, ["http://example.com/"])
        self.assertIn("unexpected_destination", [item["code"] for item in result["errors"]])

    def test_wrong_query_or_temporary_redirect_fails(self):
        source = "http://example.com/products?category=compact-camera"
        target = "https://www.example.com/products"
        result, _ = self.trace({source: {"status": 302, "location": target}, target: {"status": 200}},
                               source, target + "?category=compact-camera")
        self.assertEqual({item["code"] for item in result["errors"]}, {"temporary_redirect", "wrong_final_response"})


class ServerDiagnosticsTest(unittest.TestCase):
    DUMP = '''# configuration file /etc/nginx/nginx.conf:
events {}
http { include conf.d/*.conf; }
# configuration file /etc/nginx/conf.d/site.conf:
server {
    listen 443 ssl;
    server_name zsaki.icu;
    include ssl/site.conf;
    location / { return 301 "https://www.zsaki.icu//$request_uri"; }
    location /.well-known/acme-challenge/ { root /var/acme; }
    proxy_set_header Authorization "Bearer TOP-SECRET";
    ssl_certificate_key /secret/private-key.pem;
}
server {
    listen 443 ssl;
    server_name unrelated.example;
    ssl_certificate /unrelated.pem;
}
# configuration file /etc/nginx/ssl/site.conf:
ssl_certificate /certs/public.pem;
ssl_certificate_key /secret/private-key.pem;
'''

    def test_only_allowlisted_vhosts_directives_and_public_certificate_paths_escape(self):
        result = seo.summarize_nginx(self.DUMP)
        self.assertEqual(result["unsupported_files"], [])
        self.assertEqual(len(result["servers"]), 1)
        server = result["servers"][0]
        self.assertEqual(server["certificates"], ["/certs/public.pem"])
        self.assertEqual(server["redirects"], [{"status": "301", "target": "https://www.zsaki.icu//$request_uri"}])
        serialized = json.dumps(result)
        for forbidden in ("TOP-SECRET", "Authorization", "private-key", "unrelated.example", "unrelated.pem"):
            self.assertNotIn(forbidden, serialized)

    def test_unsupported_syntax_is_explicit_and_raw_contents_are_not_exposed(self):
        result = seo.summarize_nginx("# configuration file /etc/nginx/bad.conf:\nserver { secret TOKEN;\n")
        self.assertEqual(result["unsupported_files"], ["/etc/nginx/bad.conf"])
        self.assertNotIn("TOKEN", json.dumps(result))

    def test_explicit_default_vhost_is_reported_for_missing_root_domain(self):
        result = seo.summarize_nginx("# configuration file /etc/nginx/default.conf:\nserver { listen 443 ssl default_server; server_name _; ssl_certificate /default.pem; }\n")
        self.assertTrue(result["servers"][0]["fallback"])

    def test_docker_permission_error_does_not_claim_a_healthy_server(self):
        with patch.object(seo.shutil, "which", return_value=None), patch.object(seo, "command", return_value=(1, "", "PRIVATE-ERROR")):
            result = seo.server_report()
        self.assertEqual(result["errors"][0]["code"], "docker_unavailable")
        self.assertNotIn("PRIVATE-ERROR", json.dumps(result))

    def test_snapshot_uses_running_images_and_detects_directory_without_reading_env_files(self):
        revision = "a" * 40

        def run(args, timeout=15):
            if args == ["docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}"]:
                return 0, "a12\t1Panel-openresty\topenresty/openresty:alpine\n", ""
            if "nginx" in args:
                return 0, self.DUMP, ""
            if "openssl" in args:
                return 0, "notBefore=Oct 19 00:00:00 2026 GMT\nnotAfter=Jan 17 00:00:00 2027 GMT\nX509v3 Subject Alternative Name:\n DNS:www.zsaki.icu\n", ""
            if args[:2] == ["docker", "ps"]:
                return 0, "b34\n", ""
            if args[:2] == ["docker", "inspect"]:
                return 0, json.dumps({"image": "ghcr.io/example/app:running-image", "working_dir": "/actual/project"}), ""
            if "node" in args:
                return 0, json.dumps({"SEO_INDEXABLE": "true", "NEXT_PUBLIC_SITE_URL": "https://www.zsaki.icu", "JWT_SECRET": "PRIVATE-ENV"}), ""
            if args[0] == "git":
                return 0, revision + "\n", ""
            self.fail("Unexpected server command: " + str(args))

        with patch.object(seo.shutil, "which", return_value=None), patch.object(seo, "command", side_effect=run), patch.object(seo.Path, "is_dir", return_value=True), patch.object(seo.Path, "read_text", side_effect=AssertionError("Do not read .env files")):
            result = seo.server_report()
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["project_directory"], "/actual/project")
        self.assertEqual(result["checkout_revision"], revision)
        self.assertEqual(result["applications"][0]["image"], "ghcr.io/example/app:running-image")
        self.assertEqual(result["certificates"][0]["dns_names"], ["www.zsaki.icu"])
        self.assertNotIn("PRIVATE-ENV", json.dumps(result))
        self.assertNotIn("TOP-SECRET", json.dumps(result))

    def test_multiple_openresty_containers_are_not_selected_by_guessing(self):
        def run(args, timeout=15):
            if args == ["docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}"]:
                return 0, "a12\topenresty-one\topenresty:alpine\nb34\topenresty-two\topenresty:alpine\n", ""
            self.assertEqual(args[:2], ["docker", "ps"])
            return 0, "", ""

        with patch.object(seo.shutil, "which", return_value=None), patch.object(seo, "command", side_effect=run):
            result = seo.server_report()
        self.assertIn("openresty_ambiguous", [item["code"] for item in result["errors"]])

    def test_missing_ssh_settings_make_no_connection(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(seo.subprocess, "run") as run:
            result = seo.ssh_report()
        run.assert_not_called()
        self.assertEqual(result["errors"][0]["code"], "invalid_ssh_settings")

    def test_invalid_remote_output_is_withheld(self):
        process = subprocess.CompletedProcess([], 1, "banner PRIVATE-OUTPUT", "PRIVATE-ERROR")
        with patch.dict(os.environ, {"PROD_HOST": "example.com", "PROD_USER": "ubuntu", "PROD_SSH_PORT": "22"}), patch.object(seo.subprocess, "run", return_value=process) as run:
            result = seo.ssh_report("/a path/with ' quote")
        args = run.call_args.args[0]
        self.assertIn("StrictHostKeyChecking=yes", args)
        self.assertIn("BatchMode=yes", args)
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(result["errors"][0]["code"], "ssh_diagnostic_failed")

    def test_remote_failure_is_preserved_even_with_valid_report(self):
        data = seo.report("server")
        process = subprocess.CompletedProcess([], 1, json.dumps(data), "")
        with patch.dict(os.environ, {"PROD_HOST": "example.com", "PROD_USER": "ubuntu", "PROD_SSH_PORT": "22"}), patch.object(seo.subprocess, "run", return_value=process):
            result = seo.ssh_report()
        self.assertEqual(result["errors"][0]["code"], "remote_command_failed")

    def test_ssh_host_key_failure_has_an_actionable_reason_without_raw_output(self):
        process = subprocess.CompletedProcess([], 255, "", "Host key verification failed. PRIVATE-DETAIL")
        with patch.dict(os.environ, {"PROD_HOST": "example.com", "PROD_USER": "ubuntu", "PROD_SSH_PORT": "22"}), patch.object(seo.subprocess, "run", return_value=process):
            result = seo.ssh_report()
        self.assertEqual(result["errors"][0]["code"], "ssh_host_key_failed")
        self.assertNotIn("PRIVATE-DETAIL", json.dumps(result))

    def test_report_writes_filtered_json_and_summary(self):
        result = seo.report("server")
        seo.issue(result, "inspection_failed", "Inspection did not finish.")
        with tempfile.TemporaryDirectory() as directory:
            target, summary = Path(directory) / "report.json", Path(directory) / "report.md"
            seo.write_report(result, target, summary)
            self.assertEqual(json.loads(target.read_text())["errors"], result["errors"])
            self.assertIn("Errors: 1", summary.read_text())


if __name__ == "__main__":
    unittest.main()
