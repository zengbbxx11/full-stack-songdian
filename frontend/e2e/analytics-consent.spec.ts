import { expect, test, type Page } from "@playwright/test";

// Allow an installed Chrome/Edge locally; CI keeps Playwright's default Chromium.
test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

// All third-party analytics are intercepted: no test traffic reaches real projects.
const clarityStub = `
  window.__clarityCalls = [];
  const pending = window.clarity?.q || [];
  window.clarity = (...args) => window.__clarityCalls.push(args);
  window.clarity.v = "test";
  pending.forEach(args => window.clarity(...args));
`;

async function mockSettings(page: Page, clarityId = "testproject123") {
  await page.route("**/api/v1/public/settings", route => route.fulfill({
    json: { code: "0", data: { ga_id: "G-TEST123", clarity_id: clarityId } },
  }));
  await page.route("https://www.googletagmanager.com/**", route => route.fulfill({
    contentType: "application/javascript", body: "/* mocked GA */",
  }));
  await page.route(/https:\/\/[^/]*google-analytics\.com\//, route => route.abort());
}

async function openPreferences(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("cookie-settings:open")));
  await expect(page.getByRole("heading", { name: "Cookie preferences" })).toBeVisible();
}

async function clarityCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __clarityCalls?: unknown[] }).__clarityCalls ?? []);
}

test("Clarity and GA require consent; Clarity stops, resumes and loads only once", async ({ page }) => {
  await mockSettings(page);
  let requests = 0;
  await page.route("https://www.clarity.ms/**", route => {
    requests++;
    return route.fulfill({ contentType: "application/javascript", body: clarityStub });
  });
  await page.goto("/about");
  await expect(page.getByRole("button", { name: "Accept all", exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  expect(requests).toBe(0);

  await openPreferences(page);
  await page.getByRole("switch", { name: "Analytics", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator("head #microsoft-clarity")).toHaveCount(1);
  await expect.poll(() => clarityCalls(page)).toContainEqual([
    "consentv2", { ad_Storage: "denied", analytics_Storage: "granted" },
  ]);
  await expect(page.locator('script[src*="googletagmanager.com/gtag/js?id=G-TEST123"]')).toHaveCount(1);

  await openPreferences(page);
  await page.getByRole("button", { name: "Reject all", exact: true }).click();
  await expect.poll(() => clarityCalls(page)).toContainEqual(["stop"]);
  expect(await clarityCalls(page)).toContainEqual([
    "consentv2", { ad_Storage: "denied", analytics_Storage: "denied" },
  ]);

  await openPreferences(page);
  await page.getByRole("switch", { name: "Analytics", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect.poll(() => clarityCalls(page)).toContainEqual(["start"]);
  expect(requests).toBe(1);
  await page.locator('a[href="/contact"]').first().click();
  await expect(page.locator('form[data-clarity-mask="true"]')).toBeVisible();
  expect(requests).toBe(1);
});

test("old consent is not reused for the newly added session replay", async ({ page }) => {
  await mockSettings(page);
  await page.route("https://www.clarity.ms/**", route => route.abort());
  await page.addInitScript(() => localStorage.setItem("sd-cookie-consent", JSON.stringify({
    necessary: true, analytics: true, ts: Date.now(), v: 1,
  })));
  await page.goto("/about");
  await expect(page.getByRole("button", { name: "Accept all", exact: true })).toBeVisible();
  await expect(page.locator("#microsoft-clarity")).toHaveCount(0);
});

test("withdrawing while Clarity downloads discards the queued grant", async ({ page }) => {
  await mockSettings(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://www.clarity.ms/**", async route => {
    await gate;
    await route.fulfill({ contentType: "application/javascript", body: clarityStub });
  });
  await page.goto("/about");
  await page.getByRole("button", { name: "Accept all", exact: true }).click();
  await expect(page.locator("#microsoft-clarity")).toHaveCount(1);
  await openPreferences(page);
  await page.getByRole("button", { name: "Reject all", exact: true }).click();
  release();
  await expect.poll(() => clarityCalls(page)).toContainEqual(["stop"]);
  expect(await clarityCalls(page)).not.toContainEqual([
    "consentv2", { ad_Storage: "denied", analytics_Storage: "granted" },
  ]);
});
