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
  await page.getByRole("button", { name: "用户菜单" }).click();
  await page.getByText("退出登录").click();
  await expect(page).toHaveURL(/signin/);
  await page.goto(adminBase);
  await expect(page).toHaveURL(/signin/);
});

test("visitor submits an inquiry and it appears in admin", async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;
  // 必须等注水完成再交互：dev 首次编译 /contact 较慢时，早于注水的点击会被丢弃，
  // 表现为「点了提交但没有任何请求、也没有报错」，是此前偶发失败的真实原因。
  await page.goto("/contact", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "Custom OEM/ODM" }).click();
  await page.getByLabel(/Full Name/).fill("Playwright Buyer");
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Your Requirements/).fill("We need an OEM camera quotation for automated end-to-end testing.");
  await page.getByRole("button", { name: "Get My Free Quote" }).click();
  await expect(page.getByText("Thank you — we've got it!")).toBeVisible();

  await loginAdmin(page);
  await page.goto(`${adminBase}/inquiries`);
  await expect(page.locator("table").getByText(email, { exact: true })).toBeVisible();
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
  let createdId: number | undefined;
  // 用 try/finally 保证清理：定时文章的计划时间到达后会被后台调度器真正转为
  // PUBLISHED 并出现在官网上，不清理会持续污染公开站点和后续用例。
  try {
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
    createdId = created.data.id;

    const publicResponse = await request.get(`${apiBase}/api/v1/news/${slug}`);
    expect((await publicResponse.json()).code).toBe("A020001");
    // 详情隐藏但列表泄漏是经典漏测点，这里显式断言列表也不可见。
    const listResponse = await request.get(`${apiBase}/api/v1/news?page=1&page_size=50`);
    const list = (await listResponse.json()).data.list as { slug: string }[];
    expect(list.some((item) => item.slug === slug)).toBe(false);

    const tokenResponse = await admin.post(`/api/v1/admin/news/${created.data.id}/preview-token`);
    const token = (await tokenResponse.json()).data.token;
    await page.goto(`/preview/${encodeURIComponent(token)}`);
    await expect(page.getByRole("heading", { name: "Private Scheduled E2E Article" })).toBeVisible();
    await expect(page.getByText("Signed preview body")).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  } finally {
    if (createdId !== undefined) {
      await admin.delete(`/api/v1/admin/news/${createdId}`);
    }
    await admin.dispose();
  }
});
