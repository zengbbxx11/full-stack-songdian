import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // 用例夹具共享同一个后端数据库（本地与 CI 均为 PostgreSQL），且本机常同时跑 3 个 dev server；
  // 并行度过高会因机器过载出现 teardown 超时（不是用例失败），故固定为 2。
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    channel: process.env.E2E_BROWSER_CHANNEL,
    baseURL: process.env.E2E_FRONTEND_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "test-results",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
