import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { adminBase, adminRequest, cleanup, fixtureSuffix } from "./fixtures";
import { gotoHydrated } from "./hydration";

/**
 * 媒体库相册的创建/编辑链路（侧边栏 + 相册弹窗）：
 * - 点「+」新建时默认挂在「当前正在浏览的相册」下（仍可改），建完自动选中并展开祖先链，
 *   否则新相册藏在折叠的父节点里，看起来像「没建成」；
 * - 编辑时选「无（根级）」要真正生效（后端 PUT 的显式 parent_id=null 不再被当成「不修改」）；
 * - 父级下拉按层级路径展示并排除自身与全部子孙（挂上去会成环、整棵子树从树视图消失），
 *   后端也必须拒绝这类提交（友好错误而非 500）。
 *
 * 夹具相册一律用随机后缀命名，并在 finally 里删除（删父相册会级联删除子孙）。
 */

type AlbumRow = { id: number; name: string; slug: string; sort_order: number; parent_id: number | null };

/** 侧边栏（移动端折叠面板 + 桌面端常驻侧栏是同一个 aside）。 */
const albumsPanel = (page: Page) => page.getByRole("complementary", { name: "相册" });

/** 相册节点按钮：节点名带随机后缀、全局唯一，用文本锁定其 <li> 再取其中第一个按钮。 */
function albumNode(page: Page, name: string) {
  return albumsPanel(page).locator("li").filter({ hasText: name }).first().getByRole("button").first();
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
    data: { name, slug: `qa-album-${fixtureSuffix()}`, ...(parentId === undefined ? {} : { parent_id: parentId }) },
  });
  const body = await response.json();
  expect(body.code, JSON.stringify(body)).toBe("0");
  return Number(body.data.id);
}

async function albumParentId(admin: APIRequestContext, albumId: number): Promise<number | null | undefined> {
  return (await listAlbums(admin)).find((item) => item.id === albumId)?.parent_id;
}

test("media album: creating under the browsed album lands there, is selected and revealed", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Album Parent ${suffix}`;
  const siblingName = `QA Album Sibling ${suffix}`;
  const childName = `QA Album Child ${suffix}`;
  let parentId = 0;
  try {
    parentId = await createAlbum(admin, parentName);
    // 同一父相册下已有一个同名候选，用来验证「同级重名」提示；也用来验证新建排在它前面
    const siblingId = await createAlbum(admin, siblingName, parentId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);

    // 正在浏览某个相册时点「+」：父级应默认就是这个相册
    await albumNode(page, parentName).click();
    await page.getByRole("button", { name: "新建相册" }).click();
    await expect(page.getByRole("heading", { name: "新建相册" })).toBeVisible();
    const parentTrigger = page.getByLabel("父级相册");
    await expect(parentTrigger).toHaveAttribute("data-value", String(parentId));

    // 同级重名给出行内提示（只提示，不阻断）
    await page.getByPlaceholder("相册名称").fill(siblingName);
    await expect(page.getByText(/同级已有同名相册/)).toBeVisible();
    // 别名留空时按名称自动建议（与后端 _slugify 同规则：小写 + 连字符）
    await expect(page.getByText(/留空则自动生成：qa-album-sibling-/)).toBeVisible();

    await page.getByPlaceholder("相册名称").fill(childName);
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.getByRole("heading", { name: "新建相册" })).toBeHidden();

    // 建完可见 → 说明祖先链被自动展开；同时被选中（aria-current）
    await expect(albumNode(page, childName)).toBeVisible();
    await expect(albumNode(page, childName)).toHaveAttribute("aria-current", "true");

    // 落库的父级就是刚才浏览的那个相册
    const rows = await listAlbums(admin);
    const created = rows.find((item) => item.name === childName);
    expect(created?.parent_id).toBe(parentId);
    // 新建默认排同级最前（排序值小于既有同级）
    const sibling = rows.find((item) => item.id === siblingId);
    expect(Number(created?.sort_order)).toBeLessThan(Number(sibling?.sort_order));
  } finally {
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${parentId}`)]);
  }
});

test("media album: editing can move a child album back to the root level", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const parentName = `QA Root Target ${suffix}`;
  const childName = `QA Nested ${suffix}`;
  let parentId = 0;
  let childId = 0;
  try {
    parentId = await createAlbum(admin, parentName);
    childId = await createAlbum(admin, childName, parentId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);

    // 子相册初始在折叠的父节点下：先展开，再点它的「编辑相册」
    await albumNode(page, parentName).locator('span[role="button"]').click();
    const childLi = albumsPanel(page).locator("li").filter({ hasText: childName }).first();
    await childLi.hover(); // 桌面端编辑/删除按钮 hover 才显示
    await page.getByRole("button", { name: `编辑相册 ${childName}` }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeVisible();

    const parentTrigger = page.getByLabel("父级相册");
    await parentTrigger.click();
    await page.getByRole("listbox", { name: "父级相册 options" }).getByRole("option", { name: "无（根级）" }).click();
    await expect(parentTrigger).toHaveAttribute("data-value", "");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeHidden();

    // 后端真的把它移到了根级（修复前 parent_id=null 被当作「不修改」而静默忽略）
    await expect.poll(() => albumParentId(admin, childId)).toBeNull();
  } finally {
    await cleanup([
      () => admin.delete(`/api/v1/admin/albums/${parentId}`),
      () => admin.delete(`/api/v1/admin/albums/${childId}`),
    ]);
  }
});

test("media album: parent options exclude own subtree and the API rejects cycles", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  const suffix = fixtureSuffix();
  const rootName = `QA Cycle Root ${suffix}`;
  const childName = `QA Cycle Child ${suffix}`;
  const grandName = `QA Cycle Grand ${suffix}`;
  let rootId = 0;
  let childId = 0;
  let grandId = 0;
  try {
    rootId = await createAlbum(admin, rootName);
    childId = await createAlbum(admin, childName, rootId);
    grandId = await createAlbum(admin, grandName, childId);
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);

    // 编辑根相册：下拉不应提供自身与子孙作为父级（否则会成环、子树从树视图消失）
    const rootLi = albumsPanel(page).locator("li").filter({ hasText: rootName }).first();
    await rootLi.hover();
    await page.getByRole("button", { name: `编辑相册 ${rootName}` }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeVisible();

    await page.getByLabel("父级相册").click();
    const options = page.getByRole("listbox", { name: "父级相册 options" });
    await expect(options.getByRole("option", { name: "无（根级）" })).toBeVisible();
    await expect(options.getByRole("option", { name: childName })).toHaveCount(0);
    await expect(options.getByRole("option", { name: grandName })).toHaveCount(0);
    await expect(page.getByText(/已隐藏该相册自身及其 2 个子相册/)).toBeVisible();
    // 点下拉之外（弹窗内的标题）关闭下拉，再取消弹窗。
    // 不用 Escape：Modal 与 SelectField 都监听 Escape，会连弹窗一起关掉。
    await page.getByRole("heading", { name: "编辑相册" }).click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByRole("heading", { name: "编辑相册" })).toBeHidden();

    // 后端兜底：绕过 UI 直接提交成环请求 → 友好错误（C400001），而不是 500 或写坏层级
    const response = await admin.put(`/api/v1/admin/albums/${rootId}`, { data: { parent_id: grandId } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("C400001");
    expect(body.msg).toContain("子相册");
    expect(await albumParentId(admin, rootId)).toBeNull();
  } finally {
    await cleanup([() => admin.delete(`/api/v1/admin/albums/${rootId}`)]);
  }
});
