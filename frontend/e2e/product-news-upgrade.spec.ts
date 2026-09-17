import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { gotoHydrated } from "./hydration";
import { readProductDetailImages } from "../components/ProductDetailImages";
import { adminRequest, cleanup, createNews, createNewsCategory, createProduct, createProductCategory, removeNews, removeProducts } from "./fixtures";

test("detail image extraction removes unsafe sources and retains dimensions and order", () => {
  const images = readProductDetailImages('<p>Old highlights</p><img src="javascript:alert(1)" /><img src="/uploads/a.webp" alt="A &amp; B" width="1200" height="2400"><img src="/uploads/b.webp" onerror="alert(1)">');
  expect(images).toHaveLength(2);
  expect(images[0]).toMatchObject({ alt: "A & B", width: 1200, height: 2400 });
  expect(images[0].src).toContain("/uploads/a.webp");
  expect(images[1].src).toContain("/uploads/b.webp");
});

test("mobile product shows model, key facts and inquiry before the gallery", async ({ page }) => {
  // 自建夹具产品：key facts 只取 slug 命中 sensor/zoom/screen/video-resolution 的规格。
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Mobile fixture");
  const product = await createProduct(admin, { categoryId: category.id, attributes: [{ name: "Zoom", value: "7X Optical Zoom" }] });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, `/products/${product.categorySlug}/${product.slug}`);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const main = page.locator("main");
    const title = await main.locator("h1").boundingBox();
    const inquiry = await main.getByRole("link", { name: "Send Inquiry", exact: true }).boundingBox();
    expect(title!.y).toBeLessThan(inquiry!.y);
    expect(inquiry!.y + inquiry!.height).toBeLessThan(650);
    await expect(main.getByText("7X Optical Zoom", { exact: true }).first()).toBeVisible();
    await expect(main.getByRole("heading", { name: "Product Highlights" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Send Inquiry", exact: true })).toHaveAttribute("href", new RegExp(`category=${category.slug}`));
  } finally {
    await cleanup([() => removeProducts(admin, [product.id]), () => admin.delete(`/api/v1/admin/categories/${category.id}`)]);
  }
});

test("News categories persist in pagination canonical and invalid pages are noindex", async ({ page }) => {
  // 新闻每页 9 条，需要 ≥10 条同分类已发布文章才出现第 2 页。
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "News pagination fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 10 });
  try {
    await gotoHydrated(page, `/news?category=${category.slug}&page=2`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/news\\?category=${category.slug}&page=2$`));
    await expect(page).toHaveTitle(/Page 2/);
    await expect(page.getByRole("navigation", { name: "News categories" }).getByRole("link", { name: category.name, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", `/news?category=${category.slug}`);
    await gotoHydrated(page, `/news?category=${category.slug}&page=99999`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/news\\?category=${category.slug}$`));
  } finally {
    await cleanup([() => removeNews(admin, news.ids), () => admin.delete(`/api/v1/admin/news-categories/${category.id}`)]);
  }
});

test("detail image upload blocks save, preserves old text, and saves image order", async ({ page }) => {
  const base = process.env.E2E_ADMIN_URL || "http://localhost:3001";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw Error("Local fixture only");
  const secret = process.env.JWT_SECRET || "local-ui-regression-secret-2026-only";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: "fixture", scope: "access", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(header+"."+body).digest("base64url");
  await page.context().addCookies([{ name: "access_token", value: header+"."+body+"."+signature, url: base, httpOnly: true }]);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let saved: Record<string, string> | undefined;
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { list: [], total: 0 };
    if (path.endsWith("/revisions")) data = [];
    if (path === "/api/v1/admin/categories") data = { list: [{ id: 1, name: "Compact", slug: "compact-camera" }], total: 1 };
    if (path === "/api/v1/admin/products/999" && route.request().method() === "GET") data = {
      title: "Fixture", slug: "fixture", category: { id: 1 }, status: "DRAFT",
      content_html: '<p>Preserve legacy text</p><img src="/uploads/one.webp" alt="One" width="1200" height="2000"><img src="/uploads/two.webp" alt="Two" width="1200" height="2000">',
      galleries: [], attributes: [],
    };
    if (path === "/api/v1/admin/upload") { await gate; data = { url: "/uploads/new.png" }; }
    if (path === "/api/v1/admin/products/999" && route.request().method() === "PUT") saved = route.request().postDataJSON();
    await route.fulfill({ json: { code: "0", data } });
  });
  await gotoHydrated(page, base + "/product-form?id=999");
  await expect(page.getByLabel("详情图 1 说明")).toHaveValue("One");
  await page.getByRole("button", { name: "下移", exact: true }).first().click();
  await expect(page.getByLabel("详情图 1 说明")).toHaveValue("Two");
  await page.getByRole("button", { name: "移除此图", exact: true }).first().click();
  const buffer = await sharp({ create: { width: 20, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const request = page.waitForRequest("**/api/v1/admin/upload");
  await page.getByLabel("上传商品详情图", { exact: true }).setInputFiles({ name: "detail.png", mimeType: "image/png", buffer });
  await request;
  await expect(page.getByRole("button", { name: "详情图上传中..." })).toBeDisabled();
  release();
  await expect(page.getByLabel("详情图 2 说明")).toBeVisible();
  await page.getByRole("button", { name: "保存产品", exact: true }).click();
  await expect.poll(() => saved?.content_html).toContain("Preserve legacy text");
  expect(saved!.content_html).toContain('width="20"');
  expect(saved!.content_html).toContain('height="40"');
  expect(saved!.content_html).not.toContain("/uploads/two.webp");
  expect(saved!.content_html.indexOf("/uploads/one.webp")).toBeLessThan(saved!.content_html.indexOf("/uploads/new.png"));
});
