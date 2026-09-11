import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";

const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
const secret = process.env.JWT_SECRET || "settings-ui-test-secret-not-for-production";

async function signInFixture(page: Page, scope = "access") {
  if (!["127.0.0.1", "localhost"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: "fixture", scope, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  await page.context().addCookies([{ name: "access_token", value: `${header}.${body}.${signature}`, url: adminBase, httpOnly: true, sameSite: "Lax" }]);
}

test("news management loads drafts and all pages; filtered sorting preserves hidden positions and failed drafts", async ({ page }) => {
  await signInFixture(page);
  const news = Array.from({ length: 55 }, (_, i) => ({ id: i + 1, title: i === 1 ? "Fixture A" : i === 3 ? "Fixture B" : `Other ${i + 1}`, status: i === 1 ? "DRAFT" : i === 3 ? "SCHEDULED" : "PUBLISHED", sort_order: i }));
  let fail = true;
  const writes: { id: number; rank: number }[] = [];
  const pages: number[] = [];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/admin/news") {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      pages.push(pageNumber);
      const sorted = [...news].sort((a, b) => a.sort_order - b.sort_order);
      await route.fulfill({ json: { code: "0", data: { list: sorted.slice((pageNumber - 1) * 50, pageNumber * 50), total: news.length } } });
    } else if (url.pathname.startsWith("/api/v1/admin/news/") && route.request().method() === "PUT") {
      const id = Number(url.pathname.split("/").at(-1));
      const rank = route.request().postDataJSON().sort_order;
      writes.push({ id, rank });
      if (fail && id === 2) await route.fulfill({ status: 500, json: { code: "B999001" } });
      else {
        news.find(item => item.id === id)!.sort_order = rank;
        await route.fulfill({ json: { code: "0", data: null } });
      }
    } else await route.fulfill({ json: { code: "0", data: { list: [], total: 0 } } });
  });
  await gotoHydrated(page, `${adminBase}/news`);
  await expect(page.locator("tbody tr")).toHaveCount(55);
  expect(pages).toContain(2);
  await expect(page.getByText("草稿", { exact: true })).toBeVisible();
  await expect(page.getByText("定时发布", { exact: true })).toBeVisible();
  await page.getByPlaceholder("搜索文章...").fill("Fixture");
  await page.locator("tr").filter({ hasText: "Fixture B" }).dragTo(page.locator("tr").filter({ hasText: "Fixture A" }));
  await page.getByRole("button", { name: "保存排序", exact: true }).click();
  await expect(page.getByText(/排序保存失败 1\/55/)).toBeVisible();
  await expect(page.getByText("Order changed — unsaved")).toBeVisible();
  expect(writes.find(item => item.id === 4)?.rank).toBe(1);
  expect(writes.find(item => item.id === 2)?.rank).toBe(3);
  expect(writes.find(item => item.id === 3)?.rank).toBe(2);
  fail = false;
  await page.getByRole("button", { name: "保存排序", exact: true }).click();
  await expect(page.getByText("排序已保存", { exact: true })).toBeVisible();
  await expect(page.getByText("Order changed — unsaved")).toHaveCount(0);
  expect(news.find(item => item.id === 2)?.sort_order).toBe(3);
});

test("batch publication waits for slow writes and retains only failed selections", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInFixture(page);
  const items = [1, 2, 3].map(id => ({ id, title: `Fixture ${id}`, status: "DRAFT", sort_order: id }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = 0;
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/admin/products") {
      await route.fulfill({ json: { code: "0", data: { list: items, total: 3 } } });
    } else if (url.pathname.startsWith("/api/v1/admin/products/") && route.request().method() === "PUT") {
      const id = Number(url.pathname.split("/").at(-1));
      started++;
      if (id === 3) await gate;
      if (id === 2) await route.fulfill({ status: 403, json: { code: "C403001", msg: "Fixture denied" } });
      else {
        items.find(item => item.id === id)!.status = "PUBLISHED";
        await route.fulfill({ json: { code: "0", data: null } });
      }
    } else await route.fulfill({ json: { code: "0", data: { list: [], total: 0 } } });
  });
  await gotoHydrated(page, `${adminBase}/products`);
  await page.getByRole("checkbox", { name: "全选产品" }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "发布选中" }).click();
  await page.getByRole("dialog", { name: "批量发布" }).getByRole("button", { name: "确定", exact: true }).click();
  await expect.poll(() => started).toBe(3);
  await expect(page.getByRole("button", { name: "发布选中" })).toBeDisabled();
  release();
  await expect(page.getByText(/已发布 2\/3 个产品/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "选择 Fixture 2" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "选择 Fixture 1" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "选择 Fixture 3" })).not.toBeChecked();
});

test("refresh-scoped tokens cannot enter protected pages and expired-session login avoids redirect loops", async ({ page }) => {
  await signInFixture(page, "refresh");
  await gotoHydrated(page, `${adminBase}/news`);
  await expect(page).toHaveURL(/\/signin/);
  await signInFixture(page);
  await gotoHydrated(page, `${adminBase}/signin?expired=1`);
  await expect(page.getByPlaceholder("请输入用户名")).toBeVisible();
});
