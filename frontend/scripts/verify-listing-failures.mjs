import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { gotoHydrated } from "../e2e/hydration.ts";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.LISTING_TEST_PORT || 3003);
const secret = randomUUID();
let mode = "category-failure";
let calls = {};
const category = { id: 1, name: "Fixture Category", slug: "fixture-category" };
const api = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  calls[path] = (calls[path] || 0) + 1;
  const categories = path.endsWith("-categories");
  res.setHeader("Content-Type", "application/json");
  if ((categories && mode === "category-failure") || (!categories && mode === "list-failure")) {
    res.statusCode = 503;
    res.end(JSON.stringify({ code: "ERROR", msg: "INTERNAL_FIXTURE_ERROR" })); return;
  }
  res.end(JSON.stringify({ code: "0", data: categories ? [category] : {
    list: [{ id: 1, slug: "fixture", title: "Fixture item", summary: "Summary", category,
      stock_status: "instock", cover_image: null, published_at: "2026-09-01T00:00:00Z" }],
    total: 30, page: 1, page_size: 12,
  } }));
});
await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, INTERNAL_API_URL: "http://127.0.0.1:" + api.address().port, REVALIDATE_SECRET: secret },
});
let output = "";
server.stdout.on("data", b => { output += b; });
server.stderr.on("data", b => { output += b; });
const base = "http://localhost:" + port;
let browser;
async function invalidate() {
  const r = await fetch(base + "/api/revalidate", {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ tags: ["products", "news", "product-categories", "news-categories"], paths: ["/products", "/news"] }),
  });
  assert.equal(r.status, 200);
}
try {
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (output.includes("Ready in")) { clearInterval(timer); resolve(); }
      else if (server.exitCode !== null || Date.now() - started > 15000) {
        clearInterval(timer); reject(new Error("Preview failed to start: " + output));
      }
    }, 100);
  });
  browser = await chromium.launch();
  const page = await browser.newPage();
  // Count the document request only; speculative navigation belongs to other pages.
  await page.route("**/*", route => {
    const headers = route.request().headers();
    return headers["next-router-prefetch"] || headers.purpose === "prefetch" ? route.abort() : route.continue();
  });
  for (const route of ["products", "news"]) {
    for (const scenario of ["category-failure", "list-failure", "recovered"]) {
      mode = scenario; await invalidate(); calls = {};
      const url = "/" + route + "?category=fixture-category" + (scenario === "category-failure" ? "&page=2" : "");
      await gotoHydrated(page, base + url);
      await page.locator("main h1").waitFor();
      const text = await page.locator("main").innerText();
      const robots = await page.locator('meta[name="robots"]').getAttribute("content").catch(() => "");
      assert.ok((await page.locator('link[rel="canonical"]').getAttribute("href")).endsWith(url));
      if (scenario !== "recovered") {
        assert.ok(text.includes("Unavailable"), JSON.stringify({ scenario, text, calls }));
        assert.ok(!text.includes("Fixture item"));
        assert.ok(!text.includes("INTERNAL_FIXTURE_ERROR"));
        assert.ok(robots.includes("noindex"));
        assert.equal(await page.getByRole("link", { name: "Retry", exact: true }).getAttribute("href"), url);
        assert.equal(calls["/api/v1/" + route] || 0, scenario === "category-failure" ? 0 : 1);
      } else {
        assert.ok(text.includes("Fixture item"));
        assert.ok(!robots.includes("noindex"));
        assert.equal(calls["/api/v1/" + route], 1);
      }
      console.log("PASS", route, scenario);
      if (scenario === "list-failure") {
        mode = "recovered"; await invalidate();
        await Promise.all([
          page.waitForNavigation({ waitUntil: "load" }),
          page.getByRole("link", { name: "Retry", exact: true }).click(),
        ]);
        await page.locator("main").getByText("Fixture item", { exact: true }).waitFor();
        assert.ok(!(await page.locator('meta[name="robots"]').getAttribute("content").catch(() => "")).includes("noindex"));
        assert.ok(page.url().endsWith(url));
        console.log("PASS", route, "Retry reloads and preserves filter");
      }
    }
  }
} finally {
  await browser?.close();
  await invalidate().catch(() => {});
  if (server.exitCode === null) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
