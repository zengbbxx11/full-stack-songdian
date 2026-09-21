import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import sharp from "sharp";
import { gotoHydrated } from "./hydration";
import { readProductDetailImages } from "../components/ProductDetailImages";
import { adminRequest, cleanup, createNews, createNewsCategory, createProduct, createProductCategory, removeNews, removeProducts, removeUploads, type ProductFixture } from "./fixtures";

test("detail image extraction removes unsafe sources and retains dimensions and order", () => {
  const images = readProductDetailImages('<p>Old highlights</p><img src="javascript:alert(1)" /><img src="/uploads/a.webp" alt="A &amp; B" width="1200" height="2400"><img src="/uploads/b.webp" onerror="alert(1)">');
  expect(images).toHaveLength(2);
  expect(images[0]).toMatchObject({ alt: "A & B", width: 1200, height: 2400 });
  expect(images[0].src).toContain("/uploads/a.webp");
  expect(images[1].src).toContain("/uploads/b.webp");
});

test("mobile product keeps model, gallery, inquiry row and summary in order", async ({ page }) => {
  // 移动端顺序：型号 → 主图（限高 180px）→ 询盘按钮（两个按钮并排一行）→ 简介要点 → OEM 说明。
  // 主图前置后简介后移，询盘按钮才能仍落在首屏 650px 内（转化约束，不要放宽阈值；
  // 该阈值以「型号 H1 单行」为前提，型号名折行会再多占约 41px）。
  // 规格信息由下方 Specifications 表承载（后台属性驱动），key facts 规格块已移除。
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Mobile fixture");
  const product = await createProduct(admin, {
    categoryId: category.id,
    // 与真实商品一致用短型号：型号 H1 在 390px 下占一行（两行会多占约 41px，把按钮推到 673px）。
    title: "DC999",
    // 移动端顺序断言依赖真实主图，所以必须带封面（media: true）。
    media: true,
    // 注意：后端 clean_text 会剥离 HTML 并压缩空白，新建/编辑过的简介入库后必然是**单行**文本，
    // 因此这里用单行摘要，断言限定在要点列表容器内做子串匹配（不再依赖 <br> 拆行）。
    summary: "Full-frame sensor with 7X Optical Zoom and 4K video",
    attributes: [{ name: "Zoom", value: "7X Optical Zoom" }],
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, `/products/${product.categorySlug}/${product.slug}`);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const main = page.locator("main");
    const galleryLocator = main.locator('[role="group"][aria-label$="image gallery"]');
    // ⚠️ 本用例断言的是「主图/缩略图的真实几何」，依赖后端图能真正渲染。
    // 本地生产构建下图片优化器拒绝回环地址（dangerouslyAllowLocalIP 恒 false），
    // ProductGallery 的 onError 兜底会把主图换成占位图、把缩略图整列隐藏 —— 几何断言无从评估。
    // 这种情况显式跳过（CI 使用 HTTPS 图源，正常执行全部断言），避免用超时掩盖真实结论。
    if ((await galleryLocator.locator("img").count()) === 0) {
      test.skip(true, "本地生产构建无法渲染后端图（图片优化器拒绝回环地址）；请在 CI/HTTPS 图源下运行本用例");
    }
    const title = await main.locator("h1").boundingBox();
    const inquiry = await main.getByRole("link", { name: "Send Inquiry", exact: true }).boundingBox();
    expect(title!.y).toBeLessThan(inquiry!.y);
    expect(inquiry!.y + inquiry!.height).toBeLessThan(650);
    // 主图夹在型号与询盘按钮之间；移动端缩略图改右侧竖排后图集高≈主图高，
    // 主图因此从 180px 放大到 260px（产品主图是 1:1，照片等比放大到 260×260）。
    const gallery = await galleryLocator.boundingBox();
    expect(title!.y).toBeLessThan(gallery!.y);
    expect(gallery!.y + gallery!.height).toBeLessThanOrEqual(inquiry!.y);
    expect(gallery!.height).toBeGreaterThanOrEqual(240);
    expect(gallery!.height).toBeLessThan(300);
    // 主图本身渲染高度 ≥240px（DOM 第 2 个子节点是主图容器，避开缩略图里的 img）
    const mainImage = await galleryLocator.locator("div:nth-child(2) > div > img").boundingBox();
    expect(mainImage!.height).toBeGreaterThanOrEqual(240);
    // 缩略图改为「主图右侧竖排」：不遮挡主图（水平方向不重叠），垂直方向仍落在图集内，且可点击切换
    const thumb = await galleryLocator.locator("button").first().boundingBox();
    expect(thumb!.x).toBeGreaterThanOrEqual(mainImage!.x + mainImage!.width - 1);
    expect(thumb!.y).toBeGreaterThanOrEqual(gallery!.y - 1);
    expect(thumb!.y + thumb!.height).toBeLessThanOrEqual(gallery!.y + gallery!.height + 1);
    // 两个按钮并排同一行（省掉换行那一行的高度）
    const back = await main.getByRole("link", { name: /Back to/ }).first().boundingBox();
    expect(Math.abs(back!.y - inquiry!.y)).toBeLessThan(4);
    // 简介要点仍在页面上、无需展开即可见，但排在询盘按钮之后；
    // 断言限定在列表容器内，避免误命中下方 Specifications 表里的同名规格值
    const summaryBullet = main.locator("ul").getByText("7X Optical Zoom").first();
    await expect(summaryBullet).toBeVisible();
    const bullet = await summaryBullet.boundingBox();
    expect(inquiry!.y).toBeLessThan(bullet!.y);
    // 桌面端顺序不变（max-lg:contents 只在 <lg 生效）：简介在按钮之前，图集在信息栏左侧
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopGallery = await galleryLocator.boundingBox();
    const desktopBullet = await summaryBullet.boundingBox();
    const desktopInquiry = await main.getByRole("link", { name: "Send Inquiry", exact: true }).boundingBox();
    expect(desktopBullet!.y).toBeLessThan(desktopInquiry!.y);
    expect(desktopGallery!.x + desktopGallery!.width).toBeLessThanOrEqual(desktopBullet!.x);
    // 折叠区已移除（避免与展开的要点列表重复）
    await expect(main.getByText("More product information")).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Product Highlights" })).toHaveCount(0);
    await expect(main.getByRole("link", { name: "Send Inquiry", exact: true })).toHaveAttribute("href", new RegExp(`category=${category.slug}`));
  } finally {
    await cleanup([
      () => removeProducts(admin, [product.id]),
      // 夹具带封面/图库上传，按仓库约定一并清理媒体记录（AGENTS.md「e2e 夹具」）。
      () => removeUploads(admin, [product.mediaUrl, product.galleryUrl]),
      () => admin.delete(`/api/v1/admin/categories/${category.id}`),
    ]);
  }
});

test("related products come from the manual admin selection", async ({ page }) => {
  // 关联产品改为后台手选（单向、最多 4 个）：前台按配置顺序展示；
  // 未配置关联的产品不渲染该区块（旧的「同分类自动取 4 条」已下线）。
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Related fixture");
  const targets: ProductFixture[] = [];
  for (let i = 0; i < 5; i += 1) {
    targets.push(await createProduct(admin, { categoryId: category.id, title: `QA Related ${i}` }));
  }
  const main = await createProduct(admin, { categoryId: category.id, title: "DC997" });
  const plain = await createProduct(admin, { categoryId: category.id, title: "DC996" });
  try {
    // 故意打乱顺序选择 4 个（第 5 个不选）
    const chosen = [targets[2], targets[0], targets[3], targets[1]];
    const updated = await admin.put(`/api/v1/admin/products/${main.id}`, {
      data: { related_product_ids: chosen.map(t => t.id) },
    });
    expect(updated.ok(), await updated.text()).toBeTruthy();

    await gotoHydrated(page, `/products/${main.categorySlug}/${main.slug}`);
    const relatedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Related Products", exact: true }),
    });
    await expect(relatedSection).toBeVisible();
    const cards = relatedSection.locator('a[href^="/products/"]');
    await expect(cards.first()).toBeVisible();
    // 每张卡片有多个指向同一产品的链接（图片 + 标题），去重后即卡片数量与顺序
    const hrefs = await cards.evaluateAll(nodes => nodes.map(n => n.getAttribute("href") || ""));
    const cardHrefs = [...new Set(hrefs)];
    expect(cardHrefs).toHaveLength(4);
    chosen.forEach((target, index) => {
      expect(cardHrefs[index], `第 ${index + 1} 张卡片应为后台配置的第 ${index + 1} 个`).toContain(target.slug);
    });
    expect(cardHrefs.join(" ")).not.toContain(targets[4].slug);

    // 未配置关联的产品：整块不渲染
    await gotoHydrated(page, `/products/${plain.categorySlug}/${plain.slug}`);
    await expect(page.getByRole("heading", { name: "Related Products", exact: true })).toHaveCount(0);
  } finally {
    await cleanup([
      () => removeProducts(admin, [main.id, plain.id, ...targets.map(t => t.id)]),
      () => admin.delete(`/api/v1/admin/categories/${category.id}`),
    ]);
  }
});

test("News pagination canonical persists and invalid pages are noindex", async ({ page }) => {
  // 新闻每页 9 条，需要 ≥10 条同分类已发布文章才出现第 2 页。
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "News pagination fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 10 });
  try {
    await gotoHydrated(page, `/news?category=${category.slug}&page=2`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/news\\?category=${category.slug}&page=2$`));
    await expect(page).toHaveTitle(/Page 2/);
    // 列表已按业务要求不再渲染分类筛选按钮（2026-09-17），这里只断言分页与规范链接仍按分类生效
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
    if (path === "/api/v1/admin/upload") { await gate; data = { id: 501, url: "/uploads/new.png", file_name: "detail.png", album_id: null }; }
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
  // 详情图改从媒体库选择：选择器内上传 → 自动选中 → 确定后由编辑器读宽高并追加
  await page.route("**/uploads/new.png", route => route.fulfill({ contentType: "image/png", body: buffer }));
  await page.getByRole("button", { name: "从媒体库选择", exact: true }).click();
  const request = page.waitForRequest("**/api/v1/admin/upload");
  await page.getByLabel("选择器内上传素材").setInputFiles({ name: "detail.png", mimeType: "image/png", buffer });
  await request;
  await expect(page.getByRole("button", { name: "详情图上传中..." })).toBeDisabled();
  release();
  await page.getByRole("button", { name: /^确定（1）$/ }).click();
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
      data = { id: 501, url: "/uploads/new.png", file_name: "inline.png", album_id: null };
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
  // 正文插图改从媒体库插入：选择器内上传 → 确定后按顺序插入光标位置
  const inlineBuffer = await pngFixture(24, 48);
  await page.route("**/uploads/new.png", route => route.fulfill({ contentType: "image/png", body: inlineBuffer }));
  await page.getByTitle("从媒体库插入图片").click();
  await page.getByLabel("选择器内上传素材").setInputFiles({ name: "inline.png", mimeType: "image/png", buffer: inlineBuffer });
  // 选择器内上传期间禁止保存，并给出状态提示
  await expect(page.getByText("图片上传中，请稍候", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "正文图片上传中..." })).toBeDisabled();
  editor.releaseUpload();
  await page.getByRole("button", { name: /^确定（1）$/ }).click();
  await expect.poll(async () => await body.innerHTML()).toContain("/uploads/new.png");
  const html = await body.innerHTML();
  expect(html).toContain('alt="inline.png"');
  expect(html).toContain('width="24"');
  expect(html).toContain('height="48"');
});

test("news body HTML source mode edits the same content", async ({ page }) => {
  // 新增「HTML 源码」模式：运营可直接粘贴代码确定内容与格式；默认仍为可视化模式（既有定位依赖）。
  await mockAdminEditor(page, "/news-form?id=888", {
    "/api/v1/admin/news/888": {
      title: "Fixture article", slug: "fixture-article", category: { id: 1 }, status: "DRAFT",
      summary: "", content_html: "<p>源码初始内容</p>", author: "", cover_image: "", published_at: "",
    },
  });

  // 默认可视化：既有断言用的编辑区仍在
  await expect(page.getByRole("textbox", { name: "请输入文章内容..." })).toBeVisible();

  // 切到源码：等宽 textarea 直接承载 content_html
  await page.getByRole("tab", { name: "HTML 源码" }).click();
  const source = page.getByRole("textbox", { name: "HTML 源码" });
  await expect(source).toHaveValue("<p>源码初始内容</p>");

  // 粘贴代码 → 切回可视化即渲染（两模式共用同一份数据）
  await source.fill(
    '<h2>贴代码标题</h2><figure><img src="/uploads/x.webp" alt="图注图" width="1200" height="800"><figcaption>图注文字</figcaption></figure>',
  );
  await page.getByRole("tab", { name: "可视化" }).click();
  const body = page.getByRole("textbox", { name: "请输入文章内容..." });
  await expect(body).toContainText("贴代码标题");
  await expect(body.locator("figure img")).toHaveAttribute("src", "/uploads/x.webp");
  await expect(body.locator("figcaption")).toHaveText("图注文字");

  // 守卫：源码模式下隐藏的可视化区若派发 blur，不得用旧 innerHTML 覆盖刚粘贴的代码
  // （隐藏元素不在 a11y 树里，getByRole 匹配不到，这里用 CSS 定位派发事件）
  await page.locator('div[contenteditable="true"]').dispatchEvent("blur");
  await page.getByRole("tab", { name: "HTML 源码" }).click();
  await expect(source).toHaveValue(/贴代码标题/);
  await expect(source).toHaveValue(/figcaption/);

  // 反向路径：可视化里改内容 → 切到源码应看到同一份内容
  // （用原生 input 事件驱动 React 的 onInput，避免依赖键盘/输入法行为）
  await page.getByRole("tab", { name: "可视化" }).click();
  await body.evaluate((el) => {
    el.innerHTML = "<p>反向路径内容</p>";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("tab", { name: "HTML 源码" }).click();
  await expect(source).toHaveValue(/反向路径内容/);
});
