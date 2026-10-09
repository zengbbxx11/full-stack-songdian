import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionSeo } from "./verify-production-seo.mjs";
test("release images require explicit indexing opt-in", () => {
  for (const value of [undefined, "", "false", "TRUE", "1"])
    assert.throws(() => validateProductionSeo({ SEO_INDEXABLE: value, NEXT_PUBLIC_SITE_URL: "https://www.zsaki.icu" }));
  assert.doesNotThrow(() => validateProductionSeo({ SEO_INDEXABLE: "true", NEXT_PUBLIC_SITE_URL: "https://www.zsaki.icu" }));
});
test("release canonical origin must be HTTPS without path or credentials", () => {
  for (const url of [undefined, "invalid", "http://www.zsaki.icu", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://user:password@example.com", "https://example.com/path", "https://example.com?q=a", "https://example.com#top"])
    assert.throws(() => validateProductionSeo({ SEO_INDEXABLE: "true", NEXT_PUBLIC_SITE_URL: url }));
});
