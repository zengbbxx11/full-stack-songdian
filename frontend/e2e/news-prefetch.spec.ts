import { test, expect } from "@playwright/test";
import { gotoHydrated } from "./hydration";

test("home News cards do not prefetch articles before a click", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/news/") && url.searchParams.has("_rsc")) requests.push(url.pathname);
  });
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const cards = page.locator('main a[href^="/news/"]');
  const first = cards.first();
  await first.scrollIntoViewIfNeeded();
  await first.hover();
  const href = await first.getAttribute("href");
  // Hydration is already complete; observe network quiescence after hover.
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual([]);
  await first.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
  await expect(page.locator("main h1")).toBeVisible();
});
