import { expect, test } from "@playwright/test";

import { gotoHydrated, waitForHydration } from "./hydration";

const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
const apiBase = process.env.E2E_API_URL || "http://127.0.0.1:8000";
test.use({ timezoneId: "Asia/Shanghai" });

for (const resource of ["news", "products"] as const) {
  test(`${resource}: create, publish, withdraw, preview, schedule, restore and delete`, async ({ page, request }) => {
    test.setTimeout(90_000);
    if (!["localhost", "127.0.0.1"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
    const login = await page.request.post(`${adminBase}/api/v1/admin/login`, { data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Songdian@2026" } });
    expect((await login.json()).code).toBe("0");
    const isNews = resource === "news";
    const route = isNews ? "news-form" : "product-form";
    const title = `Lifecycle ${resource} ${Date.now()}`;
    const slug = title.toLowerCase().replaceAll(" ", "-");
    const save = page.getByRole("button", { name: isNews ? "保存" : "保存产品", exact: true });
    let id: number | undefined;
    let categoryId: number | undefined;
    const adminDetail = async () => (await (await page.request.get(`${adminBase}/api/v1/admin/${resource}/${id}`)).json()).data;
    try {
      if (!isNews) {
        const categories = await (await page.request.get(`${adminBase}/api/v1/admin/categories`)).json();
        if (categories.data.total === 0) {
          const createdCategory = await (await page.request.post(`${adminBase}/api/v1/admin/categories`, { data: { name: "Lifecycle fixture category", slug: `fixture-${Date.now()}` } })).json();
          expect(createdCategory.code).toBe("0");
          categoryId = createdCategory.data.id;
        }
      }
      await gotoHydrated(page, `${adminBase}/${route}`);
      await page.getByPlaceholder(isNews ? "文章标题" : "e.g. DC105 4K Digital Camera", { exact: true }).fill(title);
      await page.getByPlaceholder(isNews ? "文章别名" : "dc105-4k-digital-camera", { exact: true }).fill(slug);
      // 分类/状态已改为自绘 listbox（非原生 select）：展开后点击选项。
      const category = page.locator(isNews ? "#news-category" : "#product-category");
      await category.click();
      const categoryOptions = page.getByRole("option");
      await expect(categoryOptions).not.toHaveCount(1);
      await categoryOptions.nth(1).click();
      await page.locator("textarea").first().fill("Lifecycle fixture summary");
      await page.locator('[contenteditable="true"]').fill("Lifecycle fixture body");
      await page.getByLabel("内容状态").click();
      await page.getByRole("option", { name: "已发布", exact: true }).click();
      if (!isNews) {
        await page.locator("#product-seo-title").fill(`SEO ${title}`);
        await page.locator("#product-seo-description").fill("Custom product SEO description");
      }
      const createdResponse = page.waitForResponse(response => response.url().endsWith(`/api/v1/admin/${resource}`) && response.request().method() === "POST");
      await save.click();
      const created = await (await createdResponse).json();
      expect(created.code).toBe("0");
      id = created.data.id;
      await expect(page).toHaveURL(`${adminBase}/${resource}`);
      expect((await (await request.get(`${apiBase}/api/v1/${resource}/${slug}`)).json()).code).toBe("0");
      // Prime the public page before withdrawal to exercise cached content invalidation.
      const publicPath = isNews ? `/news/${slug}` : `/products/${created.data.category.slug}/${slug}`;
      await request.get(publicPath);
      if (!isNews) {
        const publicPage = await page.context().newPage();
        const frontendBase = process.env.E2E_FRONTEND_URL || "http://127.0.0.1:3000";
        const checkMetadata = async (expectedTitle: string, expectedDescription: string) => {
          await expect.poll(async () => {
            await publicPage.goto(`${frontendBase}${publicPath}`);
            return publicPage.locator('meta[name="description"]').getAttribute("content");
          }).toBe(expectedDescription);
          await expect(publicPage).toHaveTitle(new RegExp(`^${expectedTitle} \\| `));
          await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute("content", expectedTitle);
          await expect(publicPage.locator('meta[property="og:description"]')).toHaveAttribute("content", expectedDescription);
          await expect(publicPage.locator('meta[name="twitter:description"]')).toHaveAttribute("content", expectedDescription);
          await expect(publicPage.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
        };
        try {
          await checkMetadata(`SEO ${title}`, "Custom product SEO description");
          const productRow = page.locator("tr").filter({ hasText: title });
          await productRow.getByRole("button", { name: "已设置", exact: true }).click();
          await expect(page.getByRole("textbox", { name: "SEO 标题", exact: true })).toHaveValue(`SEO ${title}`);
          // Description-only metadata is still configured, and clearing title restores its fallback.
          await page.getByRole("textbox", { name: "SEO 标题", exact: true }).fill("");
          await page.getByRole("textbox", { name: "SEO 描述", exact: true }).fill("Updated description only");
          await page.getByRole("button", { name: "保存 SEO", exact: true }).click();
          await expect(page.getByRole("button", { name: "保存 SEO", exact: true })).toHaveCount(0);
          await checkMetadata(title, "Updated description only");
          await expect(productRow.getByRole("button", { name: "已设置", exact: true })).toBeVisible();
          await productRow.getByRole("button", { name: "已设置", exact: true }).click();
          await page.getByRole("textbox", { name: "SEO 描述", exact: true }).fill("");
          await page.getByRole("button", { name: "保存 SEO", exact: true }).click();
          await expect(productRow.getByRole("button", { name: "未设置", exact: true })).toBeVisible();
          await expect.poll(async () => {
            await publicPage.reload();
            return publicPage.locator('meta[name="description"]').getAttribute("content");
          }).toContain(`${title}, manufactured by `);
          await expect(publicPage).toHaveTitle(new RegExp(`^${title} \\| `));
          const detail = await adminDetail();
          // The backend's plain-text sanitizer normalizes cleared values to empty strings.
          expect(detail.seo_title).toBe("");
          expect(detail.seo_description).toBe("");
        } finally {
          await publicPage.close();
        }
      }
      await page.locator("tr").filter({ hasText: title }).getByRole("link", { name: "编辑", exact: true }).click();
      await expect(page.getByLabel("内容状态")).toHaveAttribute("data-value", "PUBLISHED");
      await page.getByLabel("内容状态").click();
      await page.getByRole("option", { name: "草稿", exact: true }).click();
      await save.click();
      await expect(page).toHaveURL(`${adminBase}/${resource}`);
      const row = page.locator("tr").filter({ hasText: title });
      await expect(row).toContainText("草稿");
      expect((await (await request.get(`${apiBase}/api/v1/${resource}/${slug}`)).json()).code).not.toBe("0");
      expect((await (await request.get(`${apiBase}/api/v1/search?q=${slug}`)).json()).data.items).toHaveLength(0);
      expect(await (await request.get("/sitemap.xml")).text()).not.toContain(slug);
      await expect.poll(async () => (await request.get(publicPath)).text()).toContain('content="noindex"');
      await row.getByRole("link", { name: "编辑", exact: true }).click();
      await expect(page.getByLabel("内容状态")).toHaveAttribute("data-value", "DRAFT");
      await expect(page.getByPlaceholder(isNews ? "文章标题" : "e.g. DC105 4K Digital Camera", { exact: true })).toHaveValue(title);
      if (!isNews) {
        await page.getByPlaceholder("名称（如：传感器）").fill("Sensor");
        await page.getByPlaceholder("值（如：4800 万像素 CMOS）").fill("Fixture sensor");
        await page.getByRole("button", { name: "添加", exact: true }).click();
        await expect(page.getByText("Fixture sensor", { exact: true })).toBeVisible();
        await page.locator('input[type="file"][multiple]').setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
        await expect(page.getByRole("img", { name: "fixture.png", exact: true })).toBeVisible();
        await page.reload();
        await waitForHydration(page);
        await expect(page.getByText("Fixture sensor", { exact: true })).toBeVisible();
        await expect(page.getByRole("img", { name: "fixture.png", exact: true })).toBeVisible();
        const attrRow = page.locator("div").filter({ has: page.getByText("Fixture sensor", { exact: true }) }).filter({ has: page.getByRole("button", { name: "删除", exact: true }) }).last();
        await attrRow.getByRole("button", { name: "删除", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
        await expect(page.getByText("Fixture sensor", { exact: true })).toHaveCount(0);
        await page.getByRole("img", { name: "fixture.png", exact: true }).locator("..").hover();
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
        await expect(page.getByRole("img", { name: "fixture.png", exact: true })).toHaveCount(0);
      }
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("button", { name: "打开预览", exact: true }).click();
      const popup = await popupPromise;
      await expect(popup).toHaveURL(/\/preview\//);
      await expect(popup.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await popup.close();
      // Asia/Shanghai 08:30 must be persisted as 00:30 UTC, not as 08:30 UTC.
      const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await page.getByLabel("内容状态").click();
      await page.getByRole("option", { name: "定时发布", exact: true }).click();
      await page.getByLabel("发布时间", { exact: true }).fill(`${day}T08:30`);
      await save.click();
      await expect(page).toHaveURL(`${adminBase}/${resource}`);
      expect(new Date((await adminDetail()).published_at).toISOString()).toBe(`${day}T00:30:00.000Z`);
      await gotoHydrated(page, `${adminBase}/${route}?id=${id}`);
      await expect(page.getByLabel("发布时间", { exact: true })).toHaveValue(`${day}T08:30`);
      await expect(page.getByRole("button", { name: "恢复", exact: true }).first()).toBeVisible();
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "恢复", exact: true }).last().click();
      await expect(page.getByLabel("内容状态")).toHaveAttribute("data-value", "PUBLISHED");
      await page.getByRole("button", { name: isNews ? "删除" : "删除产品", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
      await expect(page).toHaveURL(`${adminBase}/${resource}`);
      await expect(page.locator("tr").filter({ hasText: title })).toHaveCount(0);
      expect((await (await request.get(`${apiBase}/api/v1/${resource}/${slug}`)).json()).code).not.toBe("0");
    } finally {
      if (id) await page.request.delete(`${adminBase}/api/v1/admin/${resource}/${id}`);
      if (categoryId) await page.request.delete(`${adminBase}/api/v1/admin/categories/${categoryId}`);
    }
  });
}
