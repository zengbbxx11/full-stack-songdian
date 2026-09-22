import { test, expect } from "@playwright/test";

import { adminRequest, cleanup, createNews, createNewsCategory, removeNews, removeUploads } from "./fixtures";
import { waitForHydration } from "./hydration";

test("home News cards do not prefetch articles before a click", async ({ page }) => {
  // 自建夹具：首页卡片必须真有内容，不能依赖某台机器上的既有文章。
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "Prefetch fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 1, cover: true });
  const slug = news.slugs[0];
  const card = page.locator(`main a[href="/news/${slug}"]`);
  try {
    // 首页是静态 ISR：发布后先等缓存刷新到卡片出现，再观察预取行为。
    await expect
      .poll(async () => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        return card.count();
      }, { timeout: 60_000 })
      .toBeGreaterThan(0);

    const requests: string[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/news/") && url.searchParams.has("_rsc")) requests.push(url.pathname);
    });
    // 保留已出现夹具的当前页面；再次导航可能被其他并行用例发布的新闻挤出首页。
    await waitForHydration(page);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    // Hydration is already complete; observe network quiescence after hover.
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
    await card.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/news/${slug}`);
    await expect(page.locator("main h1")).toBeVisible();
  } finally {
    await cleanup([
      () => removeNews(admin, news.ids),
      () => admin.delete(`/api/v1/admin/news-categories/${category.id}`),
      () => removeUploads(admin, news.coverUrls),
    ]);
  }
});
