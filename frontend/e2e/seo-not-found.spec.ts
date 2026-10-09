import { expect, test } from "@playwright/test";

test("missing details and unknown routes do not inherit indexable homepage metadata", async ({ request }) => {
  const slug = "seo-missing-" + Date.now();
  for (const path of ["/" + slug, "/products/compact-camera/" + slug, "/news/" + slug]) {
    const response = await request.get(path, { headers: { "User-Agent": "Googlebot" } });
    // Next returns 200 when notFound() occurs after streaming; noindex must still be explicit.
    expect([200, 404]).toContain(response.status());
    const html = await response.text();
    expect(html).not.toMatch(/<link[^>]*rel="canonical"/);
    expect(html).not.toMatch(/<meta[^>]*name="(?:robots|googlebot)"[^>]*content="index/);
    expect(html).toMatch(/<meta[^>]*name="robots"[^>]*content="noindex/);
    expect(html).toMatch(/<meta[^>]*name="googlebot"[^>]*content="noindex/);
  }
});
