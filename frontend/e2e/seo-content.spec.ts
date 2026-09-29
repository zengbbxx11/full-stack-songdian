import { expect, test } from "@playwright/test";
import { adminBase, adminRequest, createNews, createNewsCategory, createProduct, createProductCategory, removeNews, removeProducts, cleanup } from "./fixtures";
import { gotoHydrated } from "./hydration";

test("news SEO form saves overrides, preserves visible title and restores automatic metadata", async ({ page, request }) => {
  const admin = await adminRequest();
  await page.context().addCookies((await admin.storageState()).cookies);
  const category = await createNewsCategory(admin, "SEO News");
  const news = await createNews(admin, { categoryId: category.id, count: 1, body: "<p>Real buyer guidance for optical zoom cameras.</p>" });
  const url = "/news/" + news.slugs[0];
  const id = news.ids[0];
  const apiUrl = adminBase + "/api/v1/admin/news/" + id;
  try {
    await gotoHydrated(page, adminBase + "/news-form?id=" + id);
    await page.locator("#news-seo-title").fill("OEM camera procurement guide");
    await page.locator("#news-seo-description").fill("Editorial purchasing description.");
    const saved = page.waitForResponse(r => r.url() === apiUrl && r.request().method() === "PUT");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect((await (await saved).json()).code).toBe("0");
    await gotoHydrated(page, url);
    await expect(page).toHaveTitle(/^OEM camera procurement guide \| /);
    await expect(page.locator("h1")).not.toHaveText("OEM camera procurement guide");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Editorial purchasing description.");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "OEM camera procurement guide");
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute("content", "Editorial purchasing description.");
    // Raw crawler response must carry metadata and body without client execution.
    const html = await (await request.get(url, { headers: { "User-Agent": "facebookexternalhit/1.1" } })).text();
    expect(html).toContain("Real buyer guidance for optical zoom cameras.");
    expect(html).toContain('name="description" content="Editorial purchasing description."');
    const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent || "{}")));
    expect(schemas.find(s => s["@type"] === "Article").description).toBe("Editorial purchasing description.");
    expect(schemas.some(s => s["@type"] === "BreadcrumbList")).toBeTruthy();
    await gotoHydrated(page, adminBase + "/news-form?id=" + id);
    await expect(page.locator("#news-seo-title")).toHaveValue("OEM camera procurement guide");
    await page.locator("#news-seo-title").fill("");
    await page.locator("#news-seo-description").fill("");
    const cleared = page.waitForResponse(r => r.url() === apiUrl && r.request().method() === "PUT");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    expect((await (await cleared).json()).code).toBe("0");
    await expect.poll(async () => {
      await page.goto(url);
      return page.locator('meta[name="description"]').getAttribute("content");
    }).toBe("Fixture article summary 1.");
  } finally {
    await cleanup([() => removeNews(admin, news.ids), () => admin.delete("/api/v1/admin/news-categories/" + category.id)]);
  }
});

test("published model and category enter sitemap automatically and withdrawal removes both", async ({ page, request }) => {
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Compact Camera");
  const product = await createProduct(admin, { categoryId: category.id, title: "QA789", attributes: [{ name: "Optical Zoom", value: "7X" }] });
  const url = "/products/" + product.categorySlug + "/" + product.slug;
  try {
    await gotoHydrated(page, url);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /QA789.*7X Optical Zoom/);
    await expect(page.locator("h1")).toHaveText("QA789");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical!).pathname).toBe(url);
    const old = await request.get("/products/" + product.slug, { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    expect(old.headers().location).toContain(url);
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(url);
    expect(xml).toContain("/products?category=" + category.slug);
    await admin.put("/api/v1/admin/products/" + product.id, { data: { status: "DRAFT" } });
    await expect.poll(async () => (await (await request.get("/sitemap.xml")).text()).includes(url)).toBe(false);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/products?category=" + category.slug);
  } finally {
    await cleanup([() => removeProducts(admin, [product.id]), () => admin.delete("/api/v1/admin/categories/" + category.id)]);
  }
});
