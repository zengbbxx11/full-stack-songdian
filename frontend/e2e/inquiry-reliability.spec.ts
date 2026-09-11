import { expect, test, type Page } from "@playwright/test";
import { inquiryMessage, inquirySchema } from "../lib/inquiry-form";

import { gotoHydrated } from "./hydration";

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

test("inquiry validation matches backend lengths and includes quantity in the message limit", () => {
  const values = { fullName: " Buyer ", email: " buyer@example.com ", productInterest: "custom-oem-odm-project", message: "Test requirements" };
  expect(inquirySchema.parse(values)).toMatchObject({ fullName: "Buyer", email: "buyer@example.com" });
  for (const [field, value] of Object.entries({ fullName: "a".repeat(51), email: "a".repeat(190) + "@example.com", phone: "1".repeat(21), company: "a".repeat(101), country: "a".repeat(101), message: " ".repeat(20) })) {
    expect(inquirySchema.safeParse({ ...values, [field]: value }).success, field).toBe(false);
  }
  expect(inquirySchema.safeParse({ ...values, message: "a".repeat(2000) }).success).toBe(true);
  const quantity = "500 units";
  const overhead = inquiryMessage({ message: "", quantity }).length;
  expect(inquirySchema.safeParse({ ...values, quantity, message: "a".repeat(2000 - overhead) }).success).toBe(true);
  expect(inquirySchema.safeParse({ ...values, quantity, message: "a".repeat(2001 - overhead) }).success).toBe(false);
});

async function fillInquiry(page: Page) {
  await gotoHydrated(page, "/contact?product=fixture-camera");
  const reject = page.getByRole("button", { name: "Reject", exact: true });
  await reject.click();
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).check();
  await page.getByLabel(/Full Name/).fill("Fixture Buyer");
  await page.getByLabel(/^Email/).fill("fixture@example.com");
  await page.getByLabel(/Your Requirements/).fill("Test camera inquiry requirements.");
}

test("lost response retries reuse the id; successful and edited inquiries use new ids", async ({ page }) => {
  const bodies: Record<string, string>[] = [];
  let fail = true;
  await page.route("**/api/v1/inquiries", async route => {
    bodies.push(route.request().postDataJSON());
    if (fail) await route.abort("failed");
    else await route.fulfill({ json: { code: "0", data: { id: 1 } } });
  });
  await fillInquiry(page);
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Network error");
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await page.getByLabel(/Your Requirements/).fill("Updated test camera inquiry requirements.");
  fail = false;
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.getByRole("status")).toContainText("we've got it");
  expect(bodies[2].biz_req_no).not.toBe(bodies[0].biz_req_no);
  await page.getByRole("button", { name: "Send another inquiry" }).click();
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).check();
  await page.getByLabel(/Full Name/).fill("Fixture Buyer");
  await page.getByLabel(/^Email/).fill("fixture@example.com");
  await page.getByLabel(/Your Requirements/).fill("Updated test camera inquiry requirements.");
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.getByRole("status")).toContainText("we've got it");
  expect(bodies[3].biz_req_no).not.toBe(bodies[2].biz_req_no);
});

test("product types support native arrow keys and invalid optional fields are revealed", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/inquiries", route => { requests++; return route.abort(); });
  await fillInquiry(page);
  await page.getByRole("radio", { name: "Compact Cameras", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Mirrorless Cameras", exact: true })).toBeChecked();
  await page.getByText("Add more details (optional)", { exact: true }).click();
  await page.getByLabel("Phone / WhatsApp").fill("1".repeat(21));
  await page.getByText("Add more details (optional)", { exact: true }).click();
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.getByLabel("Phone / WhatsApp")).toBeVisible();
  await expect(page.getByLabel("Phone / WhatsApp")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("form").getByRole("alert")).toContainText("20 characters");
  expect(requests).toBe(0);
});
