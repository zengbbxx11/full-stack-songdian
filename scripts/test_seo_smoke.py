import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("seo_smoke", Path(__file__).with_name("seo-smoke.py"))
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)

class SeoSmokeTest(unittest.TestCase):
    def setUp(self):
        self.origin = "https://www.example.com"
        self.paths = ["", "/about", "/products", "/news", "/solutions", "/solutions/faq", "/contact", "/privacy-policy"]
        self.urls = [self.origin + path for path in self.paths]
        self.change = None

    def read(self, url, types):
        path = url.removeprefix(self.origin)
        headers = []
        if path == "/robots.txt":
            body = "User-agent: *\nAllow: /\nSitemap: " + self.origin + "/sitemap.xml"
        elif path == "/sitemap.xml":
            body = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join("<url><loc>" + item + "</loc></url>" for item in self.urls) + "</urlset>"
        else:
            robots = "noindex, follow" if path.startswith(("/search", "/preview")) else "index, follow"
            body = '<html><head><meta name="robots" content="' + robots + '"><link rel="canonical" href="' + url + '"></head></html>'
        if self.change:
            body, headers = self.change(path, body, headers)
        return body, headers

    def run_check(self):
        with patch.object(seo, "read", side_effect=self.read):
            seo.check(self.origin, self.origin)

    def test_valid_site(self):
        self.run_check()

    def test_global_disallow(self):
        self.change = lambda p, b, h: (b.replace("Allow: /", "Disallow: /"), h) if p == "/robots.txt" else (b, h)
        with self.assertRaises(ValueError):
            self.run_check()

    def test_static_build_noindex_and_runtime_header(self):
        for header in (False, True):
            self.change = lambda p, b, h: (b.replace("index, follow", "noindex, follow"), h) if p == "/about" and not header else (b, ["googlebot: noindex"] if p == "/about" and header else h)
            with self.assertRaises(ValueError):
                self.run_check()

    def test_empty_duplicate_cross_origin_and_malformed_xml(self):
        for urls in ([], [self.urls[0]] * 2, ["https://wrong.example/"]):
            self.urls = urls
            with self.assertRaises(ValueError):
                self.run_check()
        self.urls = [self.origin]
        self.change = lambda p, b, h: ("<broken", h) if p == "/sitemap.xml" else (b, h)
        with self.assertRaises(Exception):
            self.run_check()

    def test_canonical_mismatch(self):
        self.change = lambda p, b, h: (b.replace(self.origin + "/about", self.origin + "/"), h) if p == "/about" else (b, h)
        with self.assertRaises(ValueError):
            self.run_check()

    def test_missing_search_noindex(self):
        self.change = lambda p, b, h: (b.replace("noindex, follow", "index, follow"), h) if p == "/search" else (b, h)
        with self.assertRaises(ValueError):
            self.run_check()

    def test_published_catalog_incomplete(self):
        body = '{"code":"0","data":{"page":1,"page_size":50,"total":2,"list":[]}}'
        with patch.object(seo, "read", return_value=(body, [])):
            with self.assertRaises(ValueError):
                seo.catalog(self.origin, "products")

if __name__ == "__main__":
    unittest.main()
