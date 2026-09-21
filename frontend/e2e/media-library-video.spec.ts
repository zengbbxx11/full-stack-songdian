import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";
import {
  adminBase,
  adminRequest,
  cleanup,
  createProduct,
  createProductCategory,
  removeProducts,
  removeUploads,
} from "./fixtures";

/**
 * 媒体库视频支持 + 媒体选择器：
 * - 后端接受 mp4（ftyp 容器特征）；媒体库可按类型筛选，视频瓦片有角标并可预览播放；
 * - 产品表单的封面/图库改从媒体库选择（选择器内可上传，素材自动归档到 Products / {slug}），
 *   390px 宽度下选择器同样可用且无横向溢出。
 */

// 最小合法 mp4：'ftyp' box 位于偏移 4（后端只校验容器特征与扩展名一致性，不解码）
const MP4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(64, 0x30)]);
// 1×1 PNG（与 fixtures 的夹具图同源），用于选择器内上传
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=", "base64");

async function signIn(page: Page): Promise<void> {
  if (!["localhost", "127.0.0.1"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const admin = await adminRequest();
  const state = await admin.storageState();
  await page.context().addCookies(state.cookies);
}

/** 删除自动归档相册（product:{slug}）内的素材与相册本身，避免选择器上传残留。 */
async function removeAlbumWithMedia(admin: Awaited<ReturnType<typeof adminRequest>>, albumSlug: string): Promise<void> {
  const albums = ((await (await admin.get("/api/v1/admin/albums")).json()).data?.list ?? []) as { id: number; slug: string }[];
  const album = albums.find((item) => item.slug === albumSlug);
  if (!album) return;
  // page_size 上限 200（后端 le=200）；相册素材超过一页时逐页取
  const records = ((await (await admin.get(`/api/v1/admin/upload/records?album_id=${album.id}&page_size=200`)).json()).data?.list ?? []) as { id: number }[];
  for (const record of records) await admin.delete(`/api/v1/admin/upload/${record.id}?force=true`);
  await admin.delete(`/api/v1/admin/albums/${album.id}`);
}

test("media library accepts videos, filters by type and previews playback", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const admin = await adminRequest();
  // 文件名带时间戳：上次运行异常退出留下的同名记录不会让 locator 触发 strict mode 冲突
  const videoName = `promo-${Date.now()}.mp4`;
  const upload = await admin.post("/api/v1/admin/upload", {
    multipart: { file: { name: videoName, mimeType: "video/mp4", buffer: MP4 } },
  });
  expect((await upload.json()).code).toBe("0");
  const videoUrl = (await upload.json()).data.url as string;
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoHydrated(page, `${adminBase}/media`);
    // 类型筛选（自绘下拉：触发器 data-value + listbox 内选项；变化会重置页码）
    const typeTrigger = page.getByLabel("素材类型");
    await typeTrigger.click();
    await page.getByRole("listbox", { name: "素材类型 options" }).getByRole("option", { name: "视频", exact: true }).click();
    await expect(typeTrigger).toHaveAttribute("data-value", "video");
    // 视频瓦片：进入视口才挂载 <video preload="metadata">（浏览器取首帧），左下角有「视频」角标
    const thumb = page.locator(`video[aria-label="${videoName}"]`);
    await expect(thumb).toBeVisible();
    // 角标断言限定在瓦片容器内（类型筛选触发器的选中文案也叫「视频」）
    await expect(thumb.locator("xpath=..").getByText("视频", { exact: true })).toBeVisible();
    // 切到图片：视频被筛掉
    await typeTrigger.click();
    await page.getByRole("listbox", { name: "素材类型 options" }).getByRole("option", { name: "图片", exact: true }).click();
    await expect(typeTrigger).toHaveAttribute("data-value", "image");
    await expect(thumb).toHaveCount(0);
    // 预览弹窗：<video controls> 播放 + 时长/体积信息
    await typeTrigger.click();
    await page.getByRole("listbox", { name: "素材类型 options" }).getByRole("option", { name: "视频", exact: true }).click();
    await page.getByRole("button", { name: `预览 ${videoName}` }).click();
    await expect(page.locator("video[controls]")).toBeVisible();
    await expect(page.getByText("体积：", { exact: false })).toBeVisible();
    await expect(page.getByText("时长：", { exact: false })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("video[controls]")).toHaveCount(0);
  } finally {
    await cleanup([() => removeUploads(admin, [videoUrl])]);
  }
});

test("product form picks cover and gallery images from the media picker", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Picker fixture");
  const product = await createProduct(admin, { categoryId: category.id, title: "Pick201" });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHydrated(page, `${adminBase}/product-form?id=${product.id}`);
    // 封面：单选；选择器内上传 → 自动选中 → 确定后写入 cover_image
    await page.getByRole("button", { name: "从媒体库选择封面" }).click();
    await expect(page.getByRole("heading", { name: /从媒体库选择图片/ })).toBeVisible();
    // 弹层内下拉可用（listbox 层级高于 Modal，否则只能走默认归档）
    await page.getByLabel("上传归属相册").click();
    await expect(page.getByRole("listbox", { name: "上传归属相册 options" })).toBeVisible();
    await page.getByRole("listbox", { name: "上传归属相册 options" }).getByRole("option", { name: "自动归档" }).click();
    await expect(page.getByLabel("上传归属相册")).toHaveAttribute("data-value", "");
    await page.getByLabel("选择器内上传素材").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: /^确定（1）$/ }).click();
    await expect(page.getByRole("img", { name: "Cover", exact: true })).toBeVisible();
    // 图库：多选两张，确认后逐张立即保存
    await page.getByRole("button", { name: "+ 从媒体库添加" }).click();
    await page.getByLabel("选择器内上传素材").setInputFiles([
      { name: "gallery-1.png", mimeType: "image/png", buffer: PNG },
      { name: "gallery-2.png", mimeType: "image/png", buffer: PNG },
    ]);
    await page.getByRole("button", { name: /^确定（2）$/ }).click();
    await expect(page.getByRole("img", { name: "gallery-1.png", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "gallery-2.png", exact: true })).toBeVisible();
    // 390px 下选择器与表单都不允许横向溢出
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await cleanup([
      () => removeProducts(admin, [product.id]),
      // 选择器内上传的素材归档在 Products / {slug} 子相册，连同相册一并清理
      () => removeAlbumWithMedia(admin, `product-${product.slug}`),
      () => admin.delete(`/api/v1/admin/categories/${category.id}`),
    ]);
  }
});
