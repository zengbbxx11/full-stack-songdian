import { test, expect, type Page, type Locator } from "@playwright/test";
import { gotoHydrated } from "./hydration";

test.use({ deviceScaleFactor: 1 });
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
    await page.setViewportSize({ width, height: 900 });
    await mockOptimizedImages(page);
    await gotoHydrated(page, "/products/compact-camera/dc417x");
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await checkImage(page.getByRole("group", { name: /image gallery$/ }).locator("img").last());
  });
}

test("home news cards stop growing their image requests on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOptimizedImages(page);
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await checkImage(page.locator('main a[href^="/news/"] img').first());
});

test("related news cards use their narrower article container", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockOptimizedImages(page);
  await gotoHydrated(page, "/news/songdian-unveils-dc106y-flip-top-camera-your-oem-odm-partner");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await checkImage(page.locator('main a[href^="/news/"] img').first());
});

test("gallery switching keeps the selected photo description", async ({ page }) => {
  await mockOptimizedImages(page);
  await gotoHydrated(page, "/products/compact-camera/dc417x");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const gallery = page.getByRole("group", { name: /image gallery$/ });
  const thumb = gallery.getByRole("button").nth(1);
  const alt = await thumb.locator("img").getAttribute("alt");
  await thumb.click();
  await expect(thumb).toHaveAttribute("aria-pressed", "true");
  await expect(gallery.locator("img").last()).toHaveAttribute("alt", alt!);
  await expect(gallery.locator("img").last()).toHaveAttribute("loading", "eager");
});

test.describe("high density gallery", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const width of [390, 900]) {
    test("gallery stays sharp at " + width + "px and 2x density", async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockOptimizedImages(page);
      await gotoHydrated(page, "/products/compact-camera/dc417x");
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await checkImage(page.getByRole("group", { name: /image gallery$/ }).locator("img").last());
    });
  }
});
