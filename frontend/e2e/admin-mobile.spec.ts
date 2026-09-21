import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";
import {
  adminBase,
  adminRequest,
  cleanup,
  createNews,
  createNewsCategory,
  createProduct,
  createProductCategory,
  removeNews,
  removeProducts,
  removeUploads,
} from "./fixtures";

/**
 * 后台移动端适配：
 * - <768px：列表改卡片、媒体库相册改折叠面板、表单单列 + 提交条吸底、抽屉/弹窗/下拉不越出视口；
 * - ≥768px / ≥1024px：表格、并排侧栏、普通行内提交条完全恢复（守住"桌面零变化"）。
 *
 * 每个用例都用 `document.documentElement.scrollWidth - innerWidth <= 1` 判水平溢出，
 * 这是仓库里已有的口径（见 admin-reliability.spec.ts 的批量发布用例）。
 */

/**
 * 让浏览器上下文带上后台会话。
 * 直接复用夹具会话（`adminRequest()`，每个 worker 只登录一次）的 Cookie，
 * 而不是每个用例各调一次登录接口 —— 登录限流为 10 次/分钟（后端 `RATE_LOGIN_PER_MIN`），
 * 本文件有 7 个用例，逐个登录会直接触发 429。
 */
async function signIn(page: Page): Promise<void> {
  if (!["localhost", "127.0.0.1"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const admin = await adminRequest();
  const state = await admin.storageState();
  await page.context().addCookies(state.cookies);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

test("products list shows cards on mobile without overflow and restores the table on desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Mobile fixture");
  // 两个产品：保证卡片里存在可用的「上移」按钮（排序入口不再依赖鼠标拖拽）
  const first = await createProduct(admin, { categoryId: category.id, title: "Mob201", media: true });
  const second = await createProduct(admin, { categoryId: category.id, title: "Mob202" });
  try {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, `${adminBase}/products`);
    await expectNoHorizontalOverflow(page);
    // 手机端看卡片、看不到表格
    await expect(page.locator("table")).toBeHidden();
    const card = page.getByRole("article").filter({ hasText: "Mob201" }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("已发布", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "编辑", exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "复制", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    // 触控目标 ≥40px（手指可点）
    for (const name of ["编辑", "复制", "删除"]) {
      const box = await card.getByRole(name === "删除" ? "button" : "link", { name, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(39);
    }
    // 卡片上的上移/下移就是触摸端的排序入口：点一次可用的上移 → 出现未保存提示 → 取消
    const moveUp = page.getByRole("button", { name: /^上移 / });
    let moved = false;
    for (let index = 0; index < (await moveUp.count()); index += 1) {
      if (await moveUp.nth(index).isEnabled()) {
        await moveUp.nth(index).click();
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    await expect(page.getByText("顺序已调整 — 未保存")).toBeVisible();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByText("顺序已调整 — 未保存")).toHaveCount(0);
    // 桌面恢复表格、卡片隐藏
    await page.setViewportSize(DESKTOP);
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "Mob201" })).toBeHidden();
    await expectNoHorizontalOverflow(page);
  } finally {
    await cleanup([
      () => removeProducts(admin, [first.id, second.id]),
      () => removeUploads(admin, [first.mediaUrl, first.galleryUrl]),
      () => admin.delete(`/api/v1/admin/categories/${category.id}`),
    ]);
  }
});

test("news list shows cards on mobile and restores the table on desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "Mobile fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 1 });
  try {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, `${adminBase}/news`);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator("table")).toBeHidden();
    // 按夹具标题限定，避免取到库里其它真实文章（其状态可能不是已发布）
    const card = page.getByRole("article").filter({ hasText: "Fixture article" }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("已发布", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "编辑", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "删除", exact: true })).toBeVisible();
    // 单条时上移/下移都不可用（边界禁用），但按钮本身要在，尺寸够手指点
    const down = page.getByRole("button", { name: /^下移 / });
    expect(await down.count()).toBeGreaterThan(0);
    const downBox = await down.first().boundingBox();
    expect(downBox!.width).toBeGreaterThanOrEqual(39);
    expect(downBox!.height).toBeGreaterThanOrEqual(39);
    // 桌面恢复表格
    await page.setViewportSize(DESKTOP);
    await expect(page.locator("table")).toBeVisible();
    await expect(card).toBeHidden();
    await expectNoHorizontalOverflow(page);
  } finally {
    await cleanup([
      () => removeNews(admin, news.ids),
      () => removeUploads(admin, news.coverUrls),
      () => admin.delete(`/api/v1/admin/news-categories/${category.id}`),
    ]);
  }
});

test("media library collapses the album panel on mobile and keeps the sidebar on desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.setViewportSize(MOBILE);
  await gotoHydrated(page, `${adminBase}/media`);
  await expectNoHorizontalOverflow(page);
  // 手机端：相册默认收起，开关显示当前相册
  const toggle = page.getByRole("button", { name: /^相册：/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // 页面里有两个 aside（导航侧栏 + 相册栏），用可访问名称限定相册栏
  const albums = page.getByRole("complementary", { name: "相册" });
  await expect(albums).toBeHidden();
  // 展开 → 选「全部」 → 自动收起
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(albums).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await albums.getByRole("button", { name: /^全部/ }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(albums).toBeHidden();
  // 工具条与图片网格在手机宽度下仍然可用
  await expect(page.getByPlaceholder("搜索...")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // 桌面：开关消失、侧栏常驻
  await page.setViewportSize(DESKTOP);
  await expect(toggle).toBeHidden();
  await expect(albums).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("product form fits the mobile width and keeps the save bar reachable", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Mobile fixture");
  const product = await createProduct(admin, { categoryId: category.id, title: "Mob203", media: true });
  try {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, `${adminBase}/product-form?id=${product.id}`);
    await expectNoHorizontalOverflow(page);
    // 商品详情图（含上传/排序）在手机宽度下完整可用
    await expect(page.getByRole("group", { name: "商品详情图" })).toBeVisible();
    // 提交条吸底：首屏可见，滚到底部仍可见可点
    const save = page.getByRole("button", { name: "保存产品", exact: true });
    const topBox = await save.boundingBox();
    expect(topBox!.y + topBox!.height).toBeLessThanOrEqual(MOBILE.height);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(save).toBeVisible();
    const bottomBox = await save.boundingBox();
    expect(bottomBox!.y + bottomBox!.height).toBeLessThanOrEqual(MOBILE.height);
    await expectNoHorizontalOverflow(page);
    // 桌面：提交条回到普通行内布局
    await page.setViewportSize(DESKTOP);
    await expect(save).toBeVisible();
    await expectNoHorizontalOverflow(page);
  } finally {
    await cleanup([
      () => removeProducts(admin, [product.id]),
      () => removeUploads(admin, [product.mediaUrl, product.galleryUrl]),
      () => admin.delete(`/api/v1/admin/categories/${category.id}`),
    ]);
  }
});

test("news form fits the mobile width and keeps the save bar reachable", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "Mobile fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 1 });
  try {
    await page.setViewportSize(MOBILE);
    await gotoHydrated(page, `${adminBase}/news-form?id=${news.ids[0]}`);
    await expectNoHorizontalOverflow(page);
    // 富文本工具栏在窄屏换行（不撑宽页面），且工具按钮加大到 ≥36px 便于手指点
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible();
    const toolbar = await page.evaluate(() => {
      const bars = [...document.querySelectorAll("div.flex-wrap")].filter((el) => el.querySelectorAll("button").length > 3);
      const buttons = bars.flatMap((bar) => [...bar.querySelectorAll("button")]);
      return {
        overflow: bars.reduce((max, el) => Math.max(max, el.scrollWidth - el.clientWidth), 0),
        minButtonHeight: buttons.length ? Math.min(...buttons.map((button) => Math.round(button.getBoundingClientRect().height))) : 0,
      };
    });
    expect(toolbar.overflow).toBeLessThanOrEqual(1);
    expect(toolbar.minButtonHeight).toBeGreaterThanOrEqual(40);
    // 提交条吸底
    const save = page.getByRole("button", { name: "保存", exact: true });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE.height);
    await expectNoHorizontalOverflow(page);
  } finally {
    await cleanup([
      () => removeNews(admin, news.ids),
      () => removeUploads(admin, news.coverUrls),
      () => admin.delete(`/api/v1/admin/news-categories/${category.id}`),
    ]);
  }
});

test("shell: notification dropdown stays inside the viewport and the drawer reaches the last menu item", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.setViewportSize(MOBILE);
  await gotoHydrated(page, `${adminBase}/products`);
  // 通知浮层：左右都在视口内（此前 -right-[240px] 会越出屏幕右侧）
  await page.getByRole("button", { name: /^通知/ }).click();
  await expect(page.getByRole("heading", { name: "业务通知" })).toBeVisible();
  const panel = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h5")].find((el) => el.textContent?.trim() === "业务通知");
    const wrapper = heading?.closest("div.fixed, div.absolute") as HTMLElement | null;
    if (!wrapper) return null;
    const rect = wrapper.getBoundingClientRect();
    return { left: Math.round(rect.left), right: Math.round(rect.right) };
  });
  expect(panel).not.toBeNull();
  expect(panel!.left).toBeGreaterThanOrEqual(0);
  expect(panel!.right).toBeLessThanOrEqual(MOBILE.width + 1);
  // 侧边栏抽屉：最后一个菜单项也能滚到视口内（此前 mt-16 + h-screen 会让底边超出视口 64px）
  await page.getByRole("button", { name: "切换侧边栏" }).click();
  const sidebar = page.locator("aside");
  await expect(sidebar).toBeVisible();
  const lastLink = sidebar.getByRole("link", { name: "审计日志" });
  await lastLink.scrollIntoViewIfNeeded();
  const linkBox = await lastLink.boundingBox();
  expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(MOBILE.height + 1);
});

test("modal keeps long content scrollable on a short viewport", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  // 用媒体库的相册弹窗验证：矮屏（390×640）下内容可滚、面板不越出视口
  await page.setViewportSize({ width: 390, height: 640 });
  await gotoHydrated(page, `${adminBase}/media`);
  const toggle = page.getByRole("button", { name: /^相册：/ });
  // 相册入口在折叠面板里，先展开（不要点选相册，否则面板会自动收起）
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByTitle("新建相册").click();
  await expect(page.getByRole("heading", { name: "新建相册" })).toBeVisible();
  const box = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h3")].find((el) => el.textContent?.trim() === "新建相册");
    const panel = heading?.closest("div.relative") as HTMLElement | null;
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  });
  expect(box).not.toBeNull();
  expect(box!.left).toBeGreaterThanOrEqual(0);
  expect(box!.right).toBeLessThanOrEqual(391);
  expect(box!.top).toBeGreaterThanOrEqual(0);
  expect(box!.bottom).toBeLessThanOrEqual(641);
  await expectNoHorizontalOverflow(page);
});
