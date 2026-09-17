import { expect, test, type Page } from "@playwright/test";
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
  // 移除现在需要二次确认（详情图改动不可撤销）
  await page.getByRole("button", { name: "移除", exact: true }).click();
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

/**
 * 后台编辑页的路由桩：只拦截 admin API，用于在不向业务库写入任何内容的前提下驱动编辑器交互。
 * 与上一个用例同一套路：伪造 access_token Cookie + 桩掉接口。
 */
async function mockAdminEditor(page: Page, path: string, routes: Record<string, unknown>) {
  const base = process.env.E2E_ADMIN_URL || "http://localhost:3001";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw Error("Local fixture only");
  const secret = process.env.JWT_SECRET || "local-ui-regression-secret-2026-only";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: "fixture", scope: "access", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  await page.context().addCookies([{ name: "access_token", value: `${header}.${body}.${signature}`, url: base, httpOnly: true }]);

  let gateUploads = false;
  let releaseUpload: (() => void) | undefined;
  const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });

  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let data: unknown = routes[pathname] ?? { list: [], total: 0 };
    if (pathname.endsWith("/revisions")) data = [];
    if (pathname === "/api/v1/admin/categories") data = { list: [{ id: 1, name: "Compact", slug: "compact-camera" }], total: 1 };
    if (pathname === "/api/v1/admin/upload") {
      if (gateUploads) await uploadGate;
      data = { url: "/uploads/new.png" };
    }
    await route.fulfill({ json: { code: "0", data } });
  });

  await gotoHydrated(page, base + path);
  return {
    /** 让下一次上传停在上传中，便于断言进度与禁用态。 */
    gateUploads: () => { gateUploads = true; },
    releaseUpload: () => releaseUpload?.(),
  };
}

/** 造一张真实 PNG：宽高会被 createImageBitmap 读出并写进 <img>。 */
async function pngFixture(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();
}

test("detail image block keeps empty state, drag upload, progress and unsaved guard", async ({ page }) => {
  const editor = await mockAdminEditor(page, "/product-form?id=999", {
    "/api/v1/admin/products/999": {
      title: "Fixture", slug: "fixture", category: { id: 1 }, status: "DRAFT",
      content_html: '<p>Keep me</p><img src="/uploads/one.webp" alt="One" width="1200" height="2000"><img src="/uploads/two.webp" alt="Two" width="1200" height="2000">',
      galleries: [], attributes: [],
    },
  });
  const zone = page.getByRole("group", { name: "商品详情图" });
  await expect(zone.getByText("也可以把图片直接拖进这块区域", { exact: false })).toBeVisible();
  await expect(page.getByLabel("详情图 2 说明")).toHaveValue("Two");
  // 已有详情图时不应出现空态引导
  await expect(zone.getByText("暂无详情图", { exact: false })).toHaveCount(0);

  // 拖拽上传：上传被 gate 住时应显示逐张进度，并且保存按钮禁用
  editor.gateUploads();
  const buffer = await pngFixture(20, 40);
  const transfer = await page.evaluateHandle(({ base64 }) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], "dragged.png", { type: "image/png" }));
    return dataTransfer;
  }, { base64: buffer.toString("base64") });
  await zone.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(zone.getByText("正在上传第 1/1 张", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "详情图上传中..." })).toBeDisabled();
  editor.releaseUpload();
  await expect(page.getByLabel("详情图 3 说明")).toBeVisible();

  // 未保存提醒：改动之后点“取消”应先确认，而不是直接离开
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("heading", { name: "放弃未保存的详情图改动？" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "放弃未保存的详情图改动？" })).toHaveCount(0);

  // 移除需要二次确认；全部移除后回到空态引导
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "移除此图", exact: true }).first().click();
    await page.getByRole("button", { name: "移除", exact: true }).click();
  }
  await expect(zone.getByText("暂无详情图", { exact: false })).toBeVisible();
});

test("news body editor inserts uploaded images with alt and dimensions", async ({ page }) => {
  const editor = await mockAdminEditor(page, "/news-form?id=888", {
    "/api/v1/admin/news/888": {
      title: "Fixture article", slug: "fixture-article", category: { id: 1 }, status: "DRAFT",
      summary: "", content_html: "<p>正文开头</p>", author: "", cover_image: "", published_at: "",
    },
  });
  const body = page.getByRole("textbox", { name: "请输入文章内容..." });
  await expect(body).toContainText("正文开头");

  editor.gateUploads();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTitle("插入图片").click()]);
  await chooser.setFiles({ name: "inline.png", mimeType: "image/png", buffer: await pngFixture(24, 48) });
  // 上传期间禁止保存，并给出状态提示
  await expect(page.getByText("图片上传中，请稍候", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "正文图片上传中..." })).toBeDisabled();
  editor.releaseUpload();
  await expect.poll(async () => await body.innerHTML()).toContain("/uploads/new.png");
  const html = await body.innerHTML();
  expect(html).toContain('alt="inline"');
  expect(html).toContain('width="24"');
  expect(html).toContain('height="48"');
});
