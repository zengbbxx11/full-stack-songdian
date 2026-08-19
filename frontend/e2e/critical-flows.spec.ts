import { expect, request as playwrightRequest, test } from "@playwright/test";

const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
const apiBase = process.env.E2E_API_URL || "http://127.0.0.1:8000";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "Songdian@2026";

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto(`${adminBase}/signin`);
  await page.getByPlaceholder("请输入用户名").fill("admin");
  await page.getByPlaceholder("请输入密码").fill(adminPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(`${adminBase}/`);
}

test("administrator session survives refresh and logout protects the dashboard", async ({ page }) => {
  await loginAdmin(page);
  await page.reload();
  await expect(page).not.toHaveURL(/signin/);
  await page.locator("button.dropdown-toggle").click();
  await page.getByText("退出登录").click();
  await expect(page).toHaveURL(/signin/);
  await page.goto(adminBase);
  await expect(page).toHaveURL(/signin/);
});

test("visitor submits an inquiry and it appears in admin", async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;
  await page.goto("/contact");
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).click();
  await page.getByLabel(/Full Name/).fill("Playwright Buyer");
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Your Requirements/).fill("We need an OEM camera quotation for automated end-to-end testing.");
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.getByText("Thank you — we've got it!")).toBeVisible();

  await loginAdmin(page);
  await page.goto(`${adminBase}/inquiries`);
  await expect(page.getByText(email)).toBeVisible();
});

test("scheduled news stays private but is available through a signed preview", async ({ request, page }) => {
  const admin = await playwrightRequest.newContext({ baseURL: adminBase });
  const login = await admin.post("/api/v1/admin/login", {
    data: { username: "admin", password: adminPassword },
  });
  expect(login.ok()).toBeTruthy();

  const categoriesResponse = await admin.get("/api/v1/admin/news-categories?page_size=50");
  const categories = await categoriesResponse.json();
  const categoryId = categories.data.list[0].id;
  const slug = `e2e-scheduled-${Date.now()}`;
  const createdResponse = await admin.post("/api/v1/admin/news", {
    data: {
      title: "Private Scheduled E2E Article",
      slug,
      summary: "This scheduled draft must not leak to the public API.",
      content_html: "<p>Signed preview body</p>",
      category_id: categoryId,
      status: "SCHEDULED",
      published_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  const created = await createdResponse.json();
  expect(created.code).toBe("0");

  const publicResponse = await request.get(`${apiBase}/api/v1/news/${slug}`);
  expect((await publicResponse.json()).code).toBe("A020001");

  const tokenResponse = await admin.post(`/api/v1/admin/news/${created.data.id}/preview-token`);
  const token = (await tokenResponse.json()).data.token;
  await page.goto(`/preview/${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Private Scheduled E2E Article" })).toBeVisible();
  await expect(page.getByText("Signed preview body")).toBeVisible();
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");
  await admin.dispose();
});
