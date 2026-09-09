import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
const items = [1, 2].map(id => ({ id, name: `Customer ${id}`, email: `fixture${id}@example.test`,
  message: "Fixture inquiry", status: "QUOTED", country: `Country ${id}`, tags: [], follow_notes: [], smtp_status: "PENDING" }));

async function signIn(page: Page) {
  if (!["127.0.0.1", "localhost"].includes(new URL(adminBase).hostname)) throw Error("Local fixture only");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ sub: "fixture", scope: "access", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", process.env.JWT_SECRET || "settings-ui-test-secret-not-for-production").update(`${header}.${body}`).digest("base64url");
  await page.context().addCookies([{ name: "access_token", value: `${header}.${body}.${signature}`, url: adminBase, httpOnly: true, sameSite: "Lax" }]);
}

test("switching inquiries discards the previous detail and saves only the current record", async ({ page }) => {
  await signIn(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { list: [], total: 0 };
    if (path === "/api/v1/admin/users") data = [];
    if (path === "/api/v1/admin/inquiries") data = { list: items, total: items.length };
    if (/\/inquiries\/[12]$/.test(path)) {
      const id = Number(path.split("/").at(-1));
      if (id === 1) await gate;
      data = { ...items[id - 1], reply_note: `Note ${id}` };
    }
    if (route.request().method() !== "GET") writes.push({ path, body: route.request().postDataJSON() });
    await route.fulfill({ json: { code: "0", data } });
  });
  await page.goto(`${adminBase}/inquiries`);
  const oldRequest = page.waitForRequest(request => request.url().endsWith("/inquiries/1"));
  await page.locator("tr").filter({ hasText: "Customer 1" }).getByRole("button", { name: "跟进", exact: true }).click();
  await oldRequest;
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("备注 / 回复内容")).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator("tr").filter({ hasText: "Customer 2" }).getByRole("button", { name: "跟进", exact: true }).click();
  await expect(dialog.getByLabel("备注 / 回复内容")).toHaveValue("Note 2");
  const response = page.waitForResponse(response => response.url().endsWith("/inquiries/1"));
  release();
  await response;
  await dialog.getByLabel("备注 / 回复内容").fill("Updated note");
  await expect(dialog.getByLabel("国家", { exact: false })).toHaveValue("Country 2");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0]).toEqual({ path: "/api/v1/admin/inquiries/2/status", body: { status: "QUOTED", country: "Country 2", reply_note: "Updated note" } });
});

test("failed detail loads cannot erase existing notes; retry restores the complete editable record", async ({ page }) => {
  await signIn(page);
  let failed = true;
  let writes = 0;
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes++;
    if (path.endsWith("/inquiries/1")) {
      await route.fulfill(failed ? { status: 503, json: { code: "B999001", msg: "暂时不可用" } }
        : { json: { code: "0", data: { ...items[0], reply_note: "Existing note" } } });
      return;
    }
    await route.fulfill({ json: { code: "0", data: path.endsWith("/users") ? [] : { list: items, total: items.length } } });
  });
  await page.goto(`${adminBase}/inquiries`);
  await page.locator("tr").filter({ hasText: "Customer 1" }).getByRole("button", { name: "跟进", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("详情加载失败");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  failed = false;
  await dialog.getByRole("button", { name: "重试加载" }).click();
  await expect(dialog.getByLabel("备注 / 回复内容")).toHaveValue("Existing note");
  await expect(dialog.getByLabel("状态", { exact: true })).toHaveValue("QUOTED");
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("备注 / 回复内容")).toHaveAttribute("maxlength", "1000");
});
