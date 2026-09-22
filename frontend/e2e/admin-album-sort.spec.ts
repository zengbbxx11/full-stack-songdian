import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { adminBase, adminRequest, cleanup, fixtureSuffix } from "./fixtures";
import { gotoHydrated } from "./hydration";

/**
 * 媒体库相册的同级排序：
 * - 桌面端可在同一父相册内拖动调整顺序（松手即保存，数组下标即 sort_order；跨父级拖动忽略）；
 * - 触摸端用「上移 / 下移」按钮，首项上移与末项下移置灰；
 * - 新建相册落在同级最前（★ 断言在 admin-album-tree.spec.ts 的创建用例里）；
 * - 「全部 / 未分类」与根级相册共用同一缩进网格（子级再缩进一级），弹窗不再有排序数字。
 */

type AlbumRow = { id: number; name: string; slug: string; sort_order: number; parent_id: number | null };

const albumsPanel = (page: Page) => page.getByRole("complementary", { name: "相册" });

/** 相册节点按钮：节点名带随机后缀、全局唯一，用文本锁定其 <li> 再取其中第一个按钮。 */
function albumNode(page: Page, name: string) {
  return albumsPanel(page).locator("li").filter({ hasText: name }).first().getByRole("button").first();
}

/** 相册行尾的素材计数徽标（桌面端悬停时会让位给相册名）。 */
function albumCount(page: Page, name: string) {
  return albumsPanel(page).locator("li").filter({ hasText: name }).first().locator("span.tabular-nums");
}

async function signIn(page: Page): Promise<void> {
  if (!["localhost", "127.0.0.1"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const state = await (await adminRequest()).storageState();
  await page.context().addCookies(state.cookies);
}

async function listAlbums(admin: APIRequestContext): Promise<AlbumRow[]> {
  const body = await (await admin.get("/api/v1/admin/albums")).json();
  return (body?.data?.list ?? []) as AlbumRow[];
}

async function createAlbum(admin: APIRequestContext, name: string, parentId?: number): Promise<number> {
  const response = await admin.post("/api/v1/admin/albums", {
    data: { name, slug: `qa-sort-${fixtureSuffix()}`, ...(parentId === undefined ? {} : { parent_id: parentId }) },
  });
  const body = await response.json();
  expect(body.code, JSON.stringify(body)).toBe("0");
  return Number(body.data.id);
}

/** 侧栏里这批夹具相册的实际渲染顺序（按 DOM 顺序过滤出关注的名字）。 */
async function renderedOrder(page: Page, names: string[]): Promise<string[]> {
  const texts = await albumsPanel(page).locator("li > button").allTextContents();
  return texts
    .map((text) => names.find((name) => text.includes(name)))
    .filter((name): name is string => Boolean(name));
}

/** 这批相册按接口返回（sort_order, id）的顺序对应的 sort_order 值。 */
async function sortOrders(admin: APIRequestContext, names: string[]): Promise<(number | undefined)[]> {
  const rows = await listAlbums(admin);
  return names.map((name) => rows.find((row) => row.name === name)?.sort_order);
}

test("media album: dragging inside one parent persists the order", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Drag Parent ${suffix}`;
  const names = [`QA Sort A ${suffix}`, `QA Sort B ${suffix}`, `QA Sort C ${suffix}`];
  const ids: number[] = [];
  let parentId = 0;
  try {
    // 用专属父相册承载三个子相册：根级会混入库里真实的相册与并行用例的夹具，
    // 同级集合不确定会让「拖到最前」落到别的下标（曾因此偶发失败）
    parentId = await createAlbum(admin, parentName);
    for (const name of names) ids.push(await createAlbum(admin, name, parentId));
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);
    await albumNode(page, parentName).locator('span[role="button"]').click();

    // 新建默认排同级最前 → 初始渲染顺序是「越晚建的越靠前」
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[2], names[1], names[0]]);

    // 把最下面的 A 拖到最上面
    await albumNode(page, names[0]).dragTo(albumNode(page, names[2]));
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[0], names[2], names[1]]);
    // 数组下标即 sort_order，且已归一化为 0,1,2（同级只有这三个）
    await expect.poll(() => sortOrders(admin, [names[0], names[2], names[1]])).toEqual([0, 1, 2]);

    // 刷新后顺序保持（来自服务端）
    await gotoHydrated(page, `${adminBase}/media`);
    await albumNode(page, parentName).locator('span[role="button"]').click();
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[0], names[2], names[1]]);
  } finally {
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${parentId}`)]);
  }
});

test("media album: move up/down buttons reorder siblings and disable at the edges", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Move Parent ${suffix}`;
  const names = [`QA Move A ${suffix}`, `QA Move B ${suffix}`, `QA Move C ${suffix}`];
  let parentId = 0;
  let releaseSort: (() => void) | undefined;
  try {
    // 用专属父相册承载三个子相册：同级集合由用例完全控制，才能断言「首末项按钮置灰」
    // （根级会混入库里真实的 Products / News 等，永远不是最后一项）
    parentId = await createAlbum(admin, parentName);
    for (const name of names) await createAlbum(admin, name, parentId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);
    await albumNode(page, parentName).locator('span[role="button"]').click();
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[2], names[1], names[0]]);

    // 第一项：上移禁用、下移可用
    await albumNode(page, names[2]).hover();
    await expect(page.getByRole("button", { name: `上移 ${names[2]}` })).toBeDisabled();
    await expect(page.getByRole("button", { name: `下移 ${names[2]}` })).toBeEnabled();
    const sortGate = new Promise<void>(resolve => { releaseSort = resolve; });
    await page.route("**/api/v1/admin/albums/sort", async route => {
      await sortGate;
      await route.continue();
    });
    await page.getByRole("button", { name: `下移 ${names[2]}` }).click();
    await expect(page.getByRole("button", { name: `下移 ${names[2]}`, includeHidden: true })).toBeDisabled();
    await expect(albumNode(page, names[2]).locator("..")).toHaveAttribute("draggable", "false");
    releaseSort!();
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[1], names[2], names[0]]);
    await expect.poll(() => sortOrders(admin, [names[1], names[2], names[0]])).toEqual([0, 1, 2]);

    // 最后一项：下移禁用、上移可用
    await albumNode(page, names[0]).hover();
    await expect(page.getByRole("button", { name: `下移 ${names[0]}` })).toBeDisabled();
    await expect(page.getByRole("button", { name: `上移 ${names[0]}` })).toBeEnabled();
    await page.getByRole("button", { name: `上移 ${names[0]}` }).click();
    await expect.poll(() => renderedOrder(page, names)).toEqual([names[1], names[0], names[2]]);
    await expect.poll(() => sortOrders(admin, [names[1], names[0], names[2]])).toEqual([0, 1, 2]);
  } finally {
    releaseSort?.();
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${parentId}`)]);
  }
});

test("media album: root rows align with the「全部」row and the editor has no sort input", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Align ${suffix}`;
  const childName = `QA Align Child ${suffix}`;
  let parentId = 0;
  try {
    parentId = await createAlbum(admin, parentName);
    await createAlbum(admin, childName, parentId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);

    // 根级相册的文字左缘与「全部」对齐（历史问题：节点行多占 18px 箭头槽 → 看起来低一级）
    const allBox = await albumsPanel(page).getByText("全部", { exact: true }).boundingBox();
    const rootBox = await albumsPanel(page).getByText(parentName, { exact: true }).boundingBox();
    expect(allBox).not.toBeNull();
    expect(rootBox).not.toBeNull();
    expect(Math.abs((rootBox?.x ?? 0) - (allBox?.x ?? 0))).toBeLessThanOrEqual(1);

    // 子相册比父相册再缩进一级（16px）
    await albumNode(page, parentName).locator('span[role="button"]').click();
    const childBox = await albumsPanel(page).getByText(childName, { exact: true }).boundingBox();
    const parentBox = await albumsPanel(page).getByText(parentName, { exact: true }).boundingBox();
    expect(Math.round((childBox?.x ?? 0) - (parentBox?.x ?? 0))).toBe(16);

    // 弹窗里不再有「排序」数字输入（排序改由拖动 / 上移下移承担）
    await albumNode(page, parentName).hover();
    await page.getByRole("button", { name: `编辑相册 ${parentName}` }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeHidden();
  } finally {
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${parentId}`)]);
  }
});

test("media album: row actions keep their own column and never cover the album name", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Cover Parent ${suffix}`;
  const names = [`QA Cover A ${suffix}`, `QA Cover B ${suffix}`];
  let parentId = 0;
  try {
    parentId = await createAlbum(admin, parentName);
    for (const name of names) await createAlbum(admin, name, parentId);
    // 桌面（hover 才显示按钮）、中间宽度（加宽侧栏后最容易挤压图片区，768 是进入 md: 的最窄点）、
    // 手机（按钮常显）都要覆盖
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 1024, height: 800 },
      { width: 900, height: 800 },
      { width: 768, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHydrated(page, `${adminBase}/media`);
      // <768px 相册面板默认折叠，先展开（按钮在折叠面板里）
      const panelToggle = page.getByRole("button", { name: /^相册：/ });
      if (await panelToggle.isVisible()) await panelToggle.click();
      await albumNode(page, parentName).locator('span[role="button"]').click();
      // 侧栏加宽后，中间宽度也不能把图片区挤到出现横向滚动
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow @${viewport.width}`).toBeLessThanOrEqual(1);

      const rowButton = albumNode(page, names[0]);
      await rowButton.hover();
      // 桌面端：悬停时计数让位、操作按钮出现（两条 md:group-hover 规则必须同步生效）
      if (viewport.width >= 768) {
        await expect(albumCount(page, names[0])).toBeHidden();
        await expect(page.getByRole("button", { name: `上移 ${names[0]}` })).toBeVisible();
      }
      const rowBox = await rowButton.boundingBox();
      const nameBox = await albumsPanel(page).getByText(names[0], { exact: true }).boundingBox();
      const upBox = await page.getByRole("button", { name: `上移 ${names[0]}` }).boundingBox();
      expect(rowBox, `row box @${viewport.width}`).not.toBeNull();
      expect(nameBox, `name box @${viewport.width}`).not.toBeNull();
      expect(upBox, `up button box @${viewport.width}`).not.toBeNull();

      // 操作按钮在行内右侧独立成列：主按钮右缘不得越过第一个操作按钮的左缘。
      // 旧实现是绝对定位浮层（压在行上），这条断言必然失败 —— 正是本次要防住的回归。
      expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual((upBox?.x ?? 0) + 1);
      // 名字文本所在的框也要完整落在按钮列左侧
      expect((nameBox?.x ?? 0) + (nameBox?.width ?? 0)).toBeLessThanOrEqual((upBox?.x ?? 0) + 1);
    }
  } finally {
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${parentId}`)]);
  }
});
