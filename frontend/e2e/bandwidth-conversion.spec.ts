import { expect, test } from "@playwright/test";
import { gotoHydrated } from "./hydration";

for (const width of [320, 390]) {
  test("mobile quote clears cookie consent at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await gotoHydrated(page, "/");
    const quote = page.locator("main").getByRole("link", { name: "Get a Quote", exact: true });
    await expect(quote).toHaveAttribute("href", "/contact");
    const button = await quote.boundingBox();
    const banner = await page.getByRole("button", { name: "Reject", exact: true }).boundingBox();
    expect(button).not.toBeNull();
    expect(banner).not.toBeNull();
    expect(button!.y + button!.height).toBeLessThan(banner!.y - 20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("product reference preselects the category without a lookup", async ({ page }) => {
  let lookups = 0;
  await page.route("**/api/v1/products/*/canonical", route => { lookups++; return route.abort(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, "/contact?product=dc417x&category=compact-camera");
  await expect(page.locator("[data-product-reference]")).toHaveText("Product reference: dc417x");
  await expect(page.getByRole("radio", { name: "Compact Cameras", exact: true })).toBeChecked();
  expect(lookups).toBe(0);
  const form = await page.locator("main form").boundingBox();
  const info = await page.getByText("Contact Information", { exact: true }).boundingBox();
  expect(form!.y).toBeLessThan(info!.y);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).check();
  await expect(page.getByRole("radio", { name: "Custom OEM/ODM" })).toBeChecked();
});

test("late legacy lookup preserves a buyer's manual selection", async ({ page }) => {
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/v1/products/fixture-camera/canonical", async route => {
    await ready;
    await route.fulfill({ json: { code: "0", data: { category_slug: "compact-camera" } } });
  });
  await gotoHydrated(page, "/contact?product=fixture-camera");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).check();
  const response = page.waitForResponse("**/api/v1/products/fixture-camera/canonical");
  finish();
  await response;
  await expect(page.getByRole("radio", { name: "Custom OEM/ODM" })).toBeChecked();
});

test("quote links and form fields render before application JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.route("**/_next/static/**/*.js", route => route.abort());
    await page.goto("/");
    await expect(page.locator("main").getByRole("link", { name: "Get a Quote", exact: true })).toHaveAttribute("href", "/contact");
    await page.goto("/contact?product=dc417x&category=compact-camera");
    await expect(page.getByLabel(/Full Name/)).toBeVisible();
    await expect(page.getByLabel(/^Email/)).toBeVisible();
  } finally { await context.close(); }
});
