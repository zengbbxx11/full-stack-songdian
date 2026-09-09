import { expect, test } from "@playwright/test";

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
  await page.goto("/");
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
  await page.goto("/");
  const input = page.getByRole("combobox", { name: "Search products" }).filter({ visible: true });
  await input.fill("camera");
  await expect(page.getByText("Search unavailable", { exact: true })).toBeVisible();
  // 原实现 2.5 秒后错误会变成无结果；推进浏览器时钟验证错误语义保持不变。
  await page.clock.fastForward(3000);
  await expect(page.getByText("Search unavailable", { exact: true })).toBeVisible();
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.blur();
  await input.focus();
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.clock.fastForward(350);
  await expect(page.getByRole("option")).toHaveText("Recovered");
});

test("ArrowUp selects the last suggestion and Escape clears its active descendant", async ({ page }) => {
  await page.route("**/api/v1/search?**", route => route.fulfill({ json: {
    code: "0", data: { ...result("First").data, items: [result("First").data.items[0], { ...result("Last").data.items[0], id: 2 }] },
  } }));
  await page.goto("/");
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
