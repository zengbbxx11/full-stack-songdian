import { expect, test } from "@playwright/test";
import { gotoHydrated } from "./hydration";

for (const width of [320, 390, 1024, 1440]) {
  test(`homepage conversion paths remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoHydrated(page, "/");
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Explore Products", exact: true })).toHaveAttribute("href", "/products");
    await expect(page.locator("#partnership-title")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // The carousel intentionally hides its controls while consent is visible.
    // Settle that UI state before measuring, rather than racing the consent effect.
    const reject = page.getByRole("button", { name: "Reject", exact: true });
    await reject.click();
    await expect(reject).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Homepage banner carousel" });
    if (await nav.count()) {
      const navBox = await nav.boundingBox();
      const ctaBox = await page.getByRole("link", { name: "Explore Products", exact: true }).boundingBox();
      expect(navBox).not.toBeNull();
      expect(ctaBox).not.toBeNull();
      expect(navBox!.y).toBeGreaterThanOrEqual(ctaBox!.y + ctaBox!.height);
    }
  });
}
