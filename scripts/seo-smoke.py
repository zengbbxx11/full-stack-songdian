#!/usr/bin/env python3
"""Read-only SEO smoke checks. No dependencies beyond the Python standard library."""
import argparse
import json
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit, urlencode
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.canonicals = []
        self.robots = []

    def handle_starttag(self, tag, attrs):
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        attrs = dict(attrs)
        if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonicals.append(attrs.get("href", ""))
        if tag == "meta" and attrs.get("name", "").lower() in ("robots", "googlebot"):
            self.robots.append(attrs.get("content", ""))

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False

def normalized(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))

def blocked(values):
    return any(token.rsplit(":", 1)[-1].strip().lower() in ("noindex", "nofollow", "none")
               for value in values for token in value.split(","))

def read(url, content_type):
    with urlopen(Request(url, headers={"User-Agent": "Songdian-SEO-Smoke/1.0"}), timeout=20) as response:
        if response.status != 200 or normalized(response.url) != normalized(url):
            raise ValueError(f"Expected direct HTTP 200: {url} (got {response.status}, {response.url})")
        if response.headers.get_content_type() not in content_type:
            raise ValueError(f"Unexpected Content-Type: {url}")
        return response.read().decode("utf-8"), response.headers.get_all("X-Robots-Tag", [])

def catalog(api_url, resource):
    rows, seen, total = [], set(), None
    for page in range(1, 201):
        query = urlencode({"page": page, "page_size": 50, "status": "PUBLISHED"})
        body, _ = read(f"{api_url}/api/v1/{resource}?{query}", {"application/json"})
        payload = json.loads(body)
        if str(payload.get("code")) != "0":
            raise ValueError(f"{resource}: backend business error")
        data = payload.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("list"), list):
            raise ValueError(f"{resource}: malformed pagination")
        count = data.get("total")
        if type(count) is not int or not 0 <= count <= 10000 or (total is not None and count != total):
            raise ValueError(f"{resource}: invalid/changing total")
        total = count
        if data.get("page") != page or data.get("page_size") != 50 or len(data["list"]) != min(50, total - len(rows)):
            raise ValueError(f"{resource}: incomplete pagination")
        for row in data["list"]:
            slug = row.get("slug")
            if not isinstance(slug, str) or not slug or slug in seen or row.get("status") != "PUBLISHED":
                raise ValueError(f"{resource}: invalid/repeated published entry")
            seen.add(slug)
            rows.append(row)
        if len(rows) == total:
            return rows
    raise ValueError(f"{resource}: pagination limit exceeded")

def check(base_url, site_url, api_url=None):
    base_url, site_url = base_url.rstrip("/"), site_url.rstrip("/")
    robot_text, robot_headers = read(base_url + "/robots.txt", {"text/plain"})
    robot = RobotFileParser()
    robot.parse(robot_text.splitlines())
    declarations = [line.split(":", 1)[1].strip() for line in robot_text.splitlines()
                    if line.lower().startswith("sitemap:")]
    if site_url + "/sitemap.xml" not in declarations or blocked(robot_headers):
        raise ValueError("Robots does not declare the indexable canonical sitemap")
    xml, xml_headers = read(base_url + "/sitemap.xml", {"application/xml", "text/xml"})
    root = ET.fromstring(xml)
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    if root.tag != ns + "urlset" or blocked(xml_headers):
        raise ValueError("Expected an indexable XML urlset")
    urls = [node.findtext(ns + "loc") for node in root.findall(ns + "url")]
    if not urls or len(urls) > 50000 or len(urls) != len(set(urls)):
        raise ValueError("Empty, duplicate or oversized sitemap")
    origin = urlsplit(site_url)
    for url in urls:
        parts = urlsplit(url or "")
        if not url or (parts.scheme, parts.netloc) != (origin.scheme, origin.netloc) or parts.fragment:
            raise ValueError("Sitemap URL does not use the canonical origin")
        if not robot.can_fetch("Googlebot", url):
            raise ValueError(f"Robots blocks a sitemap URL: {url}")
    if api_url:
        products = catalog(api_url.rstrip("/"), "products")
        news = catalog(api_url.rstrip("/"), "news")
        expected = {normalized(site_url + path) for path in
                    ("", "/about", "/products", "/news", "/solutions", "/solutions/faq", "/contact", "/privacy-policy")}
        for row in products:
            category = (row.get("category") or {}).get("slug")
            if not category:
                raise ValueError("Published product lacks a canonical category")
            expected.add(normalized(f"{site_url}/products/{category}/{row['slug']}"))
            expected.add(normalized(site_url + "/products?" + urlencode({"category": category})))
        expected.update(normalized(f"{site_url}/news/{row['slug']}") for row in news)
        actual = {normalized(url) for url in urls}
        if actual != expected:
            raise ValueError(f"Sitemap differs from published API data: missing={len(expected-actual)}, extra={len(actual-expected)}")
    paths = ["/", "/products", "/news", "/about"]
    for prefix in ("/products/", "/news/", "/products?category="):
        sample = next((url for url in urls if urlsplit(url).path.startswith(prefix)
                       or (prefix == "/products?category=" and "/products?category=" in url)), None)
        if sample:
            parts = urlsplit(sample)
            paths.append(parts.path + ("?" + parts.query if parts.query else ""))
    for path in paths:
        if not robot.can_fetch("Googlebot", site_url + path):
            raise ValueError(f"Robots blocks {path}")
        html, headers = read(base_url + path, {"text/html"})
        head = Head()
        head.feed(html)
        expected = normalized(site_url + path)
        if len(head.canonicals) != 1 or normalized(head.canonicals[0]) != expected:
            raise ValueError(f"Canonical mismatch: {path}")
        if not head.robots or blocked(headers + head.robots):
            raise ValueError(f"Public page is not indexable: {path}")
    for path in ("/search", "/preview/seo-smoke-invalid-token"):
        html, headers = read(base_url + path, {"text/html"})
        head = Head()
        head.feed(html)
        if not any("noindex" in value.lower() or "none" in value.lower() for value in headers + head.robots):
            raise ValueError(f"Private/search page lacks noindex: {path}")
    print(f"SEO smoke passed: {len(urls)} sitemap URLs; {len(paths)} public pages; search/preview noindex.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Fetch origin, e.g. loopback or public HTTPS")
    parser.add_argument("--site-url", required=True, help="Expected canonical origin")
    parser.add_argument("--api-url", help="Optional published API completeness comparison")
    args = parser.parse_args()
    try:
        check(args.base_url, args.site_url, args.api_url)
    except Exception as error:
        print(f"SEO smoke failed: {error}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
