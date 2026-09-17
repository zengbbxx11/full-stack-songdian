import { test, expect, type Page, type Locator, type APIRequestContext } from "@playwright/test";
import { gotoHydrated } from "./hydration";
import {
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

test.use({ deviceScaleFactor: 1 });

type Fixture = { admin: APIRequestContext; dispose: () => Promise<void> };

/** 造一个「有封面 + 1 张图库图」的已发布产品；官网图库需要封面才会渲染。 */
async function galleryProductFixture(): Promise<Fixture & { path: string; media?: string }> {
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "Gallery fixture");
  const product = await createProduct(admin, { categoryId: category.id, media: true, gallery: 1 });
  return {
    admin,
    path: `/products/${product.categorySlug}/${product.slug}`,
    media: product.mediaUrl,
    dispose: async () => {
      await cleanup([
        () => removeProducts(admin, [product.id]),
        () => admin.delete(`/api/v1/admin/categories/${category.id}`),
        () => removeUploads(admin, [product.mediaUrl, product.galleryUrl]),
      ]);
    },
  };
}

/** 造 count 篇带封面的已发布新闻，返回 slug 与清理句柄。 */
async function newsFixture(count: number) {
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "Image fixture");
  const news = await createNews(admin, { categoryId: category.id, count, cover: true });
  return {
    admin,
    news,
    dispose: async () => {
      await cleanup([
        () => removeNews(admin, news.ids),
        () => admin.delete(`/api/v1/admin/news-categories/${category.id}`),
        () => removeUploads(admin, news.coverUrls),
      ]);
    },
  };
}

async function mockOptimizedImages(page: Page) {
  await page.route("**/_next/image?**", route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=", "base64"),
  }));
}

async function checkImage(img: Locator) {
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && !!el.currentSrc)).toBe(true);
  const actual = await img.evaluate((el: HTMLImageElement) => ({
    rendered: el.getBoundingClientRect().width,
    density: window.devicePixelRatio,
    selected: Number(new URL(el.currentSrc).searchParams.get("w")),
  }));
  expect(actual.selected).toBeGreaterThanOrEqual((actual.rendered - 2) * actual.density);
  expect(actual.selected).toBeLessThanOrEqual(actual.rendered * actual.density * 1.5);
  console.log("responsive-image", actual);
}

for (const width of [390, 768, 900, 1440, 1920]) {
  test("product gallery selects an appropriate source at " + width + "px", async ({ page }) => {
    const fixture = await galleryProductFixture();
    try {
      await page.setViewportSize({ width, height: 900 });
      await mockOptimizedImages(page);
      await gotoHydrated(page, fixture.path);
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await checkImage(page.getByRole("group", { name: /image gallery$/ }).locator("img").last());
    } finally {
      await fixture.dispose();
    }
  });
}

test("home news cards stop growing their image requests on wide screens", async ({ page }) => {
  const fixture = await newsFixture(1);
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockOptimizedImages(page);
    const card = page.locator(`main a[href="/news/${fixture.news.slugs[0]}"] img`);
    // 首页是静态 ISR：发布后先等缓存刷新到卡片出现，再测量选图宽度。
    await expect
      .poll(async () => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        return card.count();
      }, { timeout: 60_000 })
      .toBeGreaterThan(0);
    await gotoHydrated(page, "/");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await checkImage(card.first());
  } finally {
    await fixture.dispose();
  }
});

test("related news cards use their narrower article container", async ({ page }) => {
  // 文章页的相关卡片需要同分类的其它文章，且必须有封面才有 <img>。
  const fixture = await newsFixture(2);
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await mockOptimizedImages(page);
    await gotoHydrated(page, `/news/${fixture.news.slugs[0]}`);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await checkImage(page.locator(`main a[href="/news/${fixture.news.slugs[1]}"] img`).first());
  } finally {
    await fixture.dispose();
  }
});

test("gallery switching keeps the selected photo description", async ({ page }) => {
  const fixture = await galleryProductFixture();
  try {
    await mockOptimizedImages(page);
    await gotoHydrated(page, fixture.path);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const gallery = page.getByRole("group", { name: /image gallery$/ });
    const thumb = gallery.getByRole("button").nth(1);
    const alt = await thumb.locator("img").getAttribute("alt");
    await thumb.click();
    await expect(thumb).toHaveAttribute("aria-pressed", "true");
    await expect(gallery.locator("img").last()).toHaveAttribute("alt", alt!);
    await expect(gallery.locator("img").last()).toHaveAttribute("loading", "eager");
  } finally {
    await fixture.dispose();
  }
});

test.describe("high density gallery", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const width of [390, 900]) {
    test("gallery stays sharp at " + width + "px and 2x density", async ({ page }) => {
      const fixture = await galleryProductFixture();
      try {
        await page.setViewportSize({ width, height: 900 });
        await mockOptimizedImages(page);
        await gotoHydrated(page, fixture.path);
        await page.getByRole("button", { name: "Reject", exact: true }).click();
        await checkImage(page.getByRole("group", { name: /image gallery$/ }).locator("img").last());
      } finally {
        await fixture.dispose();
      }
    });
  }
});
