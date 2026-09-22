import { expect, test } from "@playwright/test";

import { gotoHydrated } from "./hydration";

// 打开首页并等 React 注水完成后再交互。
// 直接 page.goto("/") 后马上 fill()，在 dev 首次编译较慢时 React 尚未注水，
// 输入不会触发防抖搜索请求，表现为「填了内容却没有任何请求、也没有报错」——
// 这是本文件三条用例失败的真实原因（不是拦截失效，也不是后端问题）。
// 注意：不能用 waitUntil: "networkidle" 代替，dev 下网络静默早于注水完成。
const openHomeHydrated = async (page: import("@playwright/test").Page) => {
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Open search", exact: true }).click();
};

const result = (title: string) => ({ code: "0", data: {
  items: [{ id: 1, kind: "product", title, slug: title.toLowerCase(), summary: "", rank: 1, cover_image: null }],
  total: 1, took_ms: 1, degraded: false,
} });

test("cleared queries discard late responses and pending queries cannot select old suggestions", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/search?**", async route => {
    if (new URL(route.request().url()).searchParams.get("q") === "old") await gate;
    await route.fulfill({ json: result("Old") });
  });
  await openHomeHydrated(page);
  const input = page.getByRole("combobox", { name: "Search products" }).filter({ visible: true });
  const request = page.waitForRequest(url => url.url().includes("q=old"));
  await input.fill("old");
  await request;
  await input.fill("");
  const response = page.waitForResponse(url => url.url().includes("q=old"));
  release();
  await response;
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await input.fill("new");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=new$/);
});

test("search errors persist until retry and Escape closes an empty popup", async ({ page }) => {
  await page.clock.install();
  let failed = true;
  await page.route("**/api/v1/search?**", route => failed
    ? route.fulfill({ status: 503, json: { code: "B999001" } })
    : route.fulfill({ json: result("Recovered") }));
  await openHomeHydrated(page);
  const input = page.getByRole("combobox", { name: "Search products" }).filter({ visible: true });
  await input.fill("camera");
  await expect(page.getByText("Search unavailable", { exact: true })).toBeVisible();
  // 原实现 2.5 秒后错误会变成无结果；推进浏览器时钟验证错误语义保持不变。
  await page.clock.fastForward(3000);
  await expect(page.getByText("Search unavailable", { exact: true })).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.blur();
  await page.getByRole("button", { name: "Open search", exact: true }).click();
  await expect(input).toBeFocused();
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.clock.fastForward(350);
  await expect(page.getByRole("option")).toHaveText("Recovered");
});

test("ArrowUp selects the last suggestion and Escape clears its active descendant", async ({ page }) => {
  await page.route("**/api/v1/search?**", route => route.fulfill({ json: {
    code: "0", data: { ...result("First").data, items: [result("First").data.items[0], { ...result("Last").data.items[0], id: 2 }] },
  } }));
  await openHomeHydrated(page);
  const input = page.getByRole("combobox", { name: "Search products" }).filter({ visible: true });
  await input.fill("camera");
  await expect(page.getByRole("option")).toHaveCount(2);
  await input.press("ArrowUp");
  await expect(page.getByRole("option", { selected: true })).toHaveText("Last");
  await input.press("Escape");
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=camera$/);
});

test("suggestion thumbnails use small optimized images and preserve error fallback", async ({ page }) => {
  await page.route("**/api/v1/search?**", route => route.fulfill({ json: {
    code: "0", data: { ...result("Camera").data, items: [
      { ...result("Camera").data.items[0], cover_image: "/uploads/fixture-camera.jpg", url: "/products/compact-camera/fixture-camera" },
    ] },
  } }));
  let width = 0;
  await page.route("**/_next/image?**", async route => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("url")?.includes("fixture-camera")) return route.continue();
    width = Number(url.searchParams.get("w"));
    await route.fulfill({ status: 404, body: "" });
  });
  await openHomeHydrated(page);
  await page.getByRole("combobox", { name: "Search products" }).filter({ visible: true }).fill("camera");
  const option = page.getByRole("option");
  await expect(option).toContainText("Camera");
  await expect.poll(() => width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(128);
  await expect(option.locator("img")).toHaveCount(0);
  await expect(option.getByRole("link")).toHaveAttribute("href", "/products/compact-camera/fixture-camera");
});
