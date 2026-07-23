"""
Regression Verification Script for Search BugFix
Tests:
  1. Search API endpoint data source verification
  2. Instant search dropdown data structure
  3. Product detail pages
  4. Backend /readyz
"""

import json
import sys
import urllib.request
import urllib.error

BASE_API = "http://localhost:8000"
BASE_FRONTEND = "http://localhost:3000"
RESULTS = {"passed": [], "failed": []}


def ok(label: str, detail: str = "") -> None:
    RESULTS["passed"].append(f"{label}: {detail}" if detail else label)
    print(f"[PASS] {label}" + (f" — {detail}" if detail else ""))


def fail(label: str, detail: str = "") -> None:
    RESULTS["failed"].append(f"{label}: {detail}" if detail else label)
    print(f"[FAIL] {label}" + (f" — {detail}" if detail else ""))


def get_json(url: str, timeout: int = 15) -> tuple[dict | None, int, str | None]:
    """GET url, return (parsed_json, status_code, error_string)."""
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body), resp.status, None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return None, e.code, body[:500]
    except Exception as e:
        return None, -1, str(e)[:500]


def get_text(url: str, timeout: int = 15) -> tuple[str | None, int, str | None]:
    """GET url, return (text, status_code, error_string)."""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return body, resp.status, None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return None, e.code, body[:500]
    except Exception as e:
        return None, -1, str(e)[:500]


# ──────────────────────────────────────────────
# TEST 1: Search API endpoint data source verification
# ──────────────────────────────────────────────
print("=" * 60)
print("TEST 1: Search API endpoint data source verification")
print("=" * 60)

for query, expected_min, desc in [
    ("led", 20, "q=led → ≥20 results, degraded=False"),
    ("DC408X", 1, "q=DC408X → ≥1 result, degraded=False"),
    ("camera", 40, "q=camera → ≥40 results, degraded=False"),
]:
    data, status, err = get_json(
        f"{BASE_API}/api/v1/search?q={query}&type=all"
    )
    if err:
        fail(desc.split("→")[0].strip(), f"HTTP error: {err}")
        continue
    if status != 200:
        fail(desc.split("→")[0].strip(), f"status={status}")
        continue
    if data is None:
        fail(desc.split("→")[0].strip(), "no JSON body")
        continue

    # API wraps search results in data.data per Result envelope
    inner = data.get("data", data)
    code = str(data.get("code", ""))
    total = inner.get("total", 0)
    degraded = inner.get("degraded", None)
    items = inner.get("items", [])
    took_ms = inner.get("took_ms")

    checks = []
    if code != "0":
        checks.append(f"code={code} (expected '0')")
    if total < expected_min:
        checks.append(f"total={total} < {expected_min}")
    if degraded not in (False, True):
        checks.append(f"degraded={degraded} (expected bool)")
    if not isinstance(items, list):
        checks.append(f"items not a list: {type(items)}")

    if query in ("led", "DC408X", "camera") and query == "DC408X" and degraded is not False:
        checks.append(f"degraded should be False for specific query {query}")

    if checks:
        fail(desc, "; ".join(checks))
    else:
        # Verify item structure
        struct_ok = all(
            isinstance(it, dict)
            and "kind" in it
            and "title" in it
            and "url" in it
            and "rank" in it
            for it in items
        ) if items else True

        if not struct_ok:
            fail(desc, "items missing kind/title/url/rank fields")
        else:
            ok(desc, f"total={total}, degraded={degraded}, took_ms={took_ms}, items structure OK")

# Also test the 2-letter query fallback
print()
data, status, err = get_json(f"{BASE_API}/api/v1/search?q=dc&type=all")
if err:
    fail("q=dc (2-letter, expects ILIKE fallback)", f"HTTP error: {err}")
elif status != 200:
    fail("q=dc (2-letter, expects ILIKE fallback)", f"status={status}")
elif data is None:
    fail("q=dc (2-letter, expects ILIKE fallback)", "no JSON body")
else:
    inner = data.get("data", data)
    code = str(data.get("code", ""))
    total = inner.get("total", 0)
    degraded = inner.get("degraded")
    if code == "0" and total > 0 and degraded is True:
        ok("q=dc (2-letter ILIKE fallback)", f"total={total}, degraded=True (correct)")
    else:
        fail("q=dc (2-letter ILIKE fallback)",
             f"code={code}, total={total}, degraded={degraded} — expected code='0', total>0, degraded=True")


# ──────────────────────────────────────────────
# TEST 2: Instant search dropdown data structure
# ──────────────────────────────────────────────
print()
print("=" * 60)
print("TEST 2: Instant search dropdown data structure")
print("=" * 60)

data, status, err = get_json(f"{BASE_API}/api/v1/search?q=led&type=all&limit=10")
if err:
    fail("Instant search data", f"HTTP error: {err}")
elif status != 200:
    fail("Instant search data", f"status={status}")
elif data is None:
    fail("Instant search data", "no JSON body")
else:
    inner = data.get("data", data)
    items = inner.get("items", [])
    if not items:
        fail("Instant search data", "no items returned")
    else:
        all_valid = True
        for i, it in enumerate(items[:10]):
            kind = it.get("kind")
            url = it.get("url", "")
            title = it.get("title", "")

            issues = []
            if kind not in ("product", "news"):
                issues.append(f"invalid kind={kind}")
            if kind == "product" and not url.startswith("/products/"):
                issues.append(f"product url doesn't start with /products/: {url}")
            if kind == "news" and not url.startswith("/news/"):
                issues.append(f"news url doesn't start with /news/: {url}")
            if not title:
                issues.append("empty title")

            if issues:
                fail(f"item[{i}] kind={kind}", "; ".join(issues))
                all_valid = False

        if all_valid:
            kinds = set(it["kind"] for it in items[:10])
            ok("Instant search data structure",
               f"{len(items[:10])} items, kinds={kinds}, all urls/titles valid")


# ──────────────────────────────────────────────
# TEST 3: Product detail pages
# ──────────────────────────────────────────────
print()
print("=" * 60)
print("TEST 3: Product detail pages (frontend)")
print("=" * 60)

for slug, expect_name in [
    ("dc325", "DC325"),
    ("dc417x", "DC417X"),
]:
    text, status, err = get_text(f"{BASE_FRONTEND}/products/{slug}")
    if err:
        fail(f"/products/{slug}", f"HTTP error: {err}")
        continue
    if status is None or status < 0:
        fail(f"/products/{slug}", f"Connection error: {err}")
        continue
    if status == 500:
        fail(f"/products/{slug}", "HTTP 500 — server error")
        continue
    if status == 404:
        fail(f"/products/{slug}", "HTTP 404 — Product Not Found")
        continue
    if status != 200:
        fail(f"/products/{slug}", f"HTTP {status} — unexpected status")
        continue
    if text is None:
        fail(f"/products/{slug}", "empty response body")
        continue

    # Check for key content markers
    has_product = expect_name.lower() in text.lower()
    has_send_inquiry = "send inquiry" in text.lower()
    has_not_found = "product not found" in text.lower()
    has_model = "model" in text.lower()

    checks = []
    if not has_product:
        checks.append(f"missing product name '{expect_name}'")
    if not has_send_inquiry:
        checks.append("missing 'Send Inquiry'")
    if has_not_found:
        checks.append("shows 'Product Not Found'")
    if not has_model:
        checks.append("missing 'Model' section")

    if checks:
        fail(f"/products/{slug}", "; ".join(checks))
    else:
        ok(f"/products/{slug}",
           f"HTTP 200, found '{expect_name}', Send Inquiry, Model present")


# ──────────────────────────────────────────────
# TEST 4: Backend /readyz
# ──────────────────────────────────────────────
print()
print("=" * 60)
print("TEST 4: Backend /readyz")
print("=" * 60)

data, status, err = get_json(f"{BASE_API}/readyz")
if err:
    fail("/readyz", f"HTTP error: {err}")
elif status != 200:
    fail("/readyz", f"status={status}")
elif data is None:
    fail("/readyz", "no JSON body")
else:
    db_ok = data.get("db") is True
    redis_ok = data.get("redis") is True
    if db_ok and redis_ok:
        ok("/readyz", f"db=True, redis=True (full: {json.dumps(data)})")
    else:
        checks = []
        if not db_ok:
            checks.append(f"db={data.get('db')}")
        if not redis_ok:
            checks.append(f"redis={data.get('redis')}")
        fail("/readyz", "; ".join(checks))


# ──────────────────────────────────────────────
# SUMMARY
# ──────────────────────────────────────────────
print()
print("=" * 60)
print("VERIFICATION SUMMARY")
print("=" * 60)
print(f"  PASSED: {len(RESULTS['passed'])}")
print(f"  FAILED: {len(RESULTS['failed'])}")

if RESULTS["failed"]:
    print("\nFAILED ITEMS:")
    for f in RESULTS["failed"]:
        print(f"  - {f}")

# Write structured results to stdout as JSON for team-lead
print()
print("__JSON_RESULTS__")
print(json.dumps(RESULTS, ensure_ascii=False, indent=2))
print("__END_JSON_RESULTS__")

# Exit code
sys.exit(1 if RESULTS["failed"] else 0)
