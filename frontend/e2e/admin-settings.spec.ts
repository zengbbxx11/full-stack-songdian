import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const adminBase = process.env.E2E_ADMIN_URL || "http://127.0.0.1:3001";
const testSecret = process.env.JWT_SECRET || "settings-ui-test-secret-not-for-production";

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

// Isolated UI regression: all admin API calls are mocked; no settings or emails
// are written to a real backend. The local test server must use the same secret.
async function setup(page: Page) {
  if (!["127.0.0.1", "localhost"].includes(new URL(adminBase).hostname)) {
    throw new Error("Settings fixtures may only run against a local admin server");
  }
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "settings-ui-test", scope: "access", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", testSecret).update(`${header}.${payload}`).digest("base64url");
  await page.context().addCookies([{
    name: "access_token", value: `${header}.${payload}.${signature}`,
    url: adminBase, httpOnly: true, sameSite: "Lax",
  }]);
  const state = {
    values: {
      ga_id: "", clarity_id: "", company_email: "contact@example.com",
      smtp_host: "smtp.example.com", smtp_password: "******",
    } as Record<string, string>,
    writes: [] as Record<string, string>[],
    reads: 0,
    failRead: false,
    failWrite: false,
    failTest: false,
    nextRead: undefined as Promise<void> | undefined,
  };
  const labels: Record<string, string> = {
    ga_id: "Google Analytics ID", clarity_id: "Microsoft Clarity 项目 ID",
    company_email: "联系邮箱", smtp_host: "SMTP 服务器", smtp_password: "SMTP 授权码",
  };
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/settings")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        state.writes.push(body);
        if (state.failWrite) {
          await route.fulfill({ status: 500, json: { code: "B999001", msg: "保存失败（测试）" } });
          return;
        }
        Object.assign(state.values, body);
        if (state.values.smtp_password) state.values.smtp_password = "******";
        await route.fulfill({ json: { code: "0", msg: "保存成功", data: null } });
        return;
      }
      state.reads++;
      const gate = state.nextRead;
      state.nextRead = undefined;
      if (gate) await gate;
      if (state.failRead) {
        await route.fulfill({ status: 503, json: { code: "B999001", msg: "读取失败（测试）" } });
        return;
      }
      await route.fulfill({ json: {
        code: "0", data: Object.fromEntries(Object.entries(state.values).map(([key, value]) => [key, {
          value, label: labels[key], description: "",
        }])),
      } });
      return;
    }
    if (path.endsWith("/settings/smtp/test")) {
      await route.fulfill({ json: {
        code: state.failTest ? "A010003" : "0",
        msg: state.failTest ? "测试邮件发送失败" : "测试邮件已发送", data: null,
      } });
      return;
    }
    await route.fulfill({ json: { code: "0", data: path.endsWith("/profile")
      ? { username: "Settings UI", email: "test@example.com" }
      : { list: [], unread_count: 0 } } });
  });
  return state;
}

test("saved plain values survive navigation and reload; only edited fields are sent", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${adminBase}/settings`);
  await expect(page.getByLabel("联系邮箱", { exact: true })).toHaveValue("contact@example.com");
  await expect(page.getByLabel("SMTP 授权码", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByText("已配置（不显示明文）；不修改或留空均保留原值")).toBeVisible();
  await page.getByLabel("Google Analytics ID", { exact: true }).fill("G-SAVED123");
  await page.getByLabel("Microsoft Clarity 项目 ID", { exact: true }).fill("clarity123");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ ga_id: "G-SAVED123", clarity_id: "clarity123" }]);
  await page.getByRole("link", { name: "账号", exact: true }).click();
  await expect(page).toHaveURL(`${adminBase}/account`);
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-SAVED123");
  await page.reload();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-SAVED123");
  await expect(page.getByLabel("Microsoft Clarity 项目 ID", { exact: true })).toHaveValue("clarity123");
  await expect(page.getByRole("button", { name: "保存修改", exact: true })).toBeDisabled();
});

test("fresh reads update cached fields without overwriting an unsaved edit", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${adminBase}/settings`);
  await expect(page.getByLabel("联系邮箱", { exact: true })).toHaveValue("contact@example.com");
  await page.getByRole("link", { name: "账号", exact: true }).click();
  await expect(page).toHaveURL(`${adminBase}/account`);
  // Expire SWR's default deduplication window before returning to the page.
  await page.waitForTimeout(2200);
  let release!: () => void;
  state.nextRead = new Promise<void>((resolve) => { release = resolve; });
  const reads = state.reads;
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await page.getByLabel("Google Analytics ID", { exact: true }).fill("G-UNSAVED");
  state.values.ga_id = "G-SERVER";
  state.values.clarity_id = "server123";
  release();
  await expect(page.getByLabel("Microsoft Clarity 项目 ID", { exact: true })).toHaveValue("server123");
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-UNSAVED");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ ga_id: "G-UNSAVED" }]);
});

test("plain values can be cleared but blank secrets are preserved and new secrets become masked", async ({ page }) => {
  const state = await setup(page);
  state.values.ga_id = "G-EXISTING";
  await page.goto(`${adminBase}/settings`);
  await page.getByLabel("Google Analytics ID", { exact: true }).fill("");
  await page.getByLabel("SMTP 授权码", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByLabel("SMTP 授权码", { exact: true })).toHaveValue("******");
  expect(state.writes).toEqual([{ ga_id: "" }]);
  await page.getByLabel("SMTP 授权码", { exact: true }).fill("new-test-secret");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByLabel("SMTP 授权码", { exact: true })).toHaveValue("******");
  expect(state.writes[1]).toEqual({ smtp_password: "new-test-secret" });
  await page.reload();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("SMTP 授权码", { exact: true })).toHaveValue("******");
});

test("load errors are explicit and retry restores saved values", async ({ page }) => {
  const state = await setup(page);
  state.failRead = true;
  state.values.ga_id = "G-EXISTING";
  await page.goto(`${adminBase}/settings`);
  await expect(page.getByRole("alert").filter({ hasText: "设置加载失败" })).toBeVisible();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存修改", exact: true })).toBeDisabled();
  state.failRead = false;
  await page.getByRole("button", { name: "重新读取设置", exact: true }).click();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-EXISTING");
});

test("failed writes keep drafts; failed readback keeps the successfully saved value", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${adminBase}/settings`);
  await page.getByLabel("Google Analytics ID", { exact: true }).fill("G-RETRY");
  state.failWrite = true;
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("保存失败（测试）", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-RETRY");
  state.failWrite = false;
  state.failRead = true;
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "设置重新读取失败" })).toBeVisible();
  await expect(page.getByLabel("Google Analytics ID", { exact: true })).toHaveValue("G-RETRY");
  state.failRead = false;
  await page.getByRole("button", { name: "重新读取设置", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "设置重新读取失败" })).toHaveCount(0);
  expect(state.values.ga_id).toBe("G-RETRY");
});

test("SMTP test shares the save path even when sending fails", async ({ page }) => {
  const state = await setup(page);
  state.failTest = true;
  await page.goto(`${adminBase}/settings`);
  await page.getByLabel("SMTP 服务器", { exact: true }).fill("smtp.updated.example.com");
  await page.getByRole("button", { name: "测试发送", exact: true }).click();
  await expect(page.getByText("测试邮件发送失败", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ smtp_host: "smtp.updated.example.com" }]);
  await page.reload();
  await expect(page.getByLabel("SMTP 服务器", { exact: true })).toHaveValue("smtp.updated.example.com");
});
