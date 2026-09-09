import { expect, request as playwrightRequest, test } from "@playwright/test";

test("missing news uses the standard noindex boundary", async ({ page }) => {
  await page.goto(`/news/quality-missing-${Date.now()}`);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).not.toHaveCount(0);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
});

test("published news emits ISO dates and sitemap excludes drafts", async ({ page, request }) => {
  const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
  if (!["127.0.0.1", "localhost"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const admin = await playwrightRequest.newContext({ baseURL: adminBase });
  const ids: number[] = [];
  try {
    const login = await admin.post("/api/v1/admin/login", { data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Songdian@2026" } });
    expect((await login.json()).code).toBe("0");
    const categories = await (await admin.get("/api/v1/admin/news-categories?page_size=50")).json();
    const suffix = Date.now();
    const slugs = [`quality-public-${suffix}`, `quality-draft-${suffix}`];
    for (const [index, slug] of slugs.entries()) {
      const result = await (await admin.post("/api/v1/admin/news", { data: {
        title: index === 0 ? "Quality regression article" : "Quality regression draft", slug,
        summary: "Isolated test fixture.", content_html: "<p>Isolated test article body.</p>",
        category_id: categories.data.list[0].id, status: index === 0 ? "PUBLISHED" : "DRAFT",
        published_at: "2026-08-01T12:30:00Z",
      } })).json();
      expect(result.code).toBe("0");
      ids.push(result.data.id);
    }
    await page.goto(`/news/${slugs[0]}`);
    await expect(page.getByRole("heading", { name: "Quality regression article", exact: true })).toBeVisible();
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute("content", /^2026-08-01T12:30:00/);
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveCount(0);
    await expect(page.locator("time").first()).toHaveAttribute("datetime", /^2026-08-01T12:30:00/);
    const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(elements => elements.map(element => JSON.parse(element.textContent || "{}")));
    const article = schema.find(item => item["@type"] === "Article");
    expect(article.datePublished).toMatch(/^2026-08-01T12:30:00/);
    expect(article).not.toHaveProperty("dateModified");
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBeTruthy();
    const xml = await response.text();
    expect(xml).toContain(`/news/${slugs[0]}`);
    expect(xml).not.toContain(`/news/${slugs[1]}`);
  } finally {
    for (const id of ids) await admin.delete(`/api/v1/admin/news/${id}`);
    await admin.dispose();
  }
});

test("map requests wait until the map approaches the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let tileRequests = 0;
  await page.route("https://server.arcgisonline.com/**", route => { tileRequests++; return route.abort(); });
  await page.goto("/contact");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.locator("[data-map-state]")).toHaveAttribute("data-map-state", "deferred");
  expect(tileRequests).toBe(0);
  await page.locator("[data-map-state]").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-map-state]")).toHaveAttribute("data-map-state", "active");
  await expect.poll(() => tileRequests).toBeGreaterThan(0);
  await expect(page.locator(".leaflet-container")).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`public pages fit the ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    // No test analytics or third-party map traffic.
    await page.route("https://server.arcgisonline.com/**", route => route.abort());
    for (const route of ["/", "/products", "/news", "/about", "/solutions", "/solutions/faq", "/contact", "/search?q=camera"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, route).toBeLessThanOrEqual(1);
      if (route === "/" || route === "/contact") {
        const filename = `${route === "/" ? "home" : "contact"}-${width}.png`;
        await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true });
      }
    }
  });
}
