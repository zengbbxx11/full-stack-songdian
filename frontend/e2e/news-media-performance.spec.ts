import { test, expect } from "@playwright/test";
import { cleanPostContent } from "../lib/html-cleaner";

test("article media retains SEO dimensions and strips unsafe content", async ({ page }) => {
  const html = cleanPostContent('<img src="/uploads/news/test.webp" alt="Factory line" width="1200" height="800" onerror="alert(1)"><video src="/uploads/news/tour.mp4" poster="javascript:alert(1)" autoplay><source src="/uploads/news/tour.webm" type="video/webm"></video><script>alert(1)</script>', { hasLeadImage: true });
  await page.route("**/*", route => route.abort());
  await page.setContent(html);
  await expect(page.locator("img")).toHaveAttribute("loading", "lazy");
  await expect(page.locator("img")).toHaveAttribute("decoding", "async");
  await expect(page.locator("img")).toHaveAttribute("width", "1200");
  await expect(page.locator("img")).toHaveAttribute("height", "800");
  await expect(page.locator("img")).toHaveAttribute("alt", "Factory line");
  expect(await page.locator("img").getAttribute("src")).toMatch(/^https?:/);
  await expect(page.locator("video")).toHaveAttribute("preload", "none");
  await expect(page.locator("video")).toHaveAttribute("controls", "");
  expect(await page.locator("video").getAttribute("autoplay")).toBeNull();
  expect(await page.locator("video").getAttribute("poster")).toBeNull();
  expect(await page.locator("img").getAttribute("onerror")).toBeNull();
  await expect(page.locator("script")).toHaveCount(0);
});

test("an article without a cover keeps only its first body image eager", async ({ page }) => {
  await page.route("**/*", route => route.abort());
  await page.setContent(cleanPostContent('<img src="/uploads/first.webp"><img src="/uploads/second.webp">'));
  await expect(page.locator("img").nth(0)).toHaveAttribute("loading", "eager");
  await expect(page.locator("img").nth(1)).toHaveAttribute("loading", "lazy");
});

test("offscreen body image and video do not fetch with the first image", async ({ page }) => {
  const requests: string[] = [];
  await page.route("https://fixture.invalid/**", async route => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=", "base64") });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const first = cleanPostContent('<img src="https://fixture.invalid/first.png" width="20" height="20">');
  const deferred = cleanPostContent('<img src="https://fixture.invalid/later.png" width="20" height="20"><video src="https://fixture.invalid/tour.mp4"></video>', { hasLeadImage: true });
  await page.setContent(first + '<div style="height:10000px"></div>' + deferred);
  await expect.poll(() => requests.includes("/first.png")).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(requests).not.toContain("/later.png");
  expect(requests).not.toContain("/tour.mp4");
  await page.locator('img[loading="lazy"]').scrollIntoViewIfNeeded();
  await expect.poll(() => requests.includes("/later.png")).toBe(true);
  expect(requests).not.toContain("/tour.mp4");
});
