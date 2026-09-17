import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.SITEMAP_TEST_PORT || 3002);
const secret = randomUUID();
let version = "first", incomplete = false, calls = 0;
const api = createServer((req, res) => {
  calls++;
  res.setHeader("Content-Type", "application/json");
  const product = req.url.startsWith("/api/v1/products?");
  res.end(JSON.stringify({ code: "0", data: {
    list: incomplete ? [] : [product
      ? { slug: "fixture-camera", category: { slug: "compact-camera" }, updated_time: "2026-08-10T12:00:00Z" }
      : { slug: version }],
    total: incomplete ? 2 : 1,
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
async function invalidate() {
  const r = await fetch(base + "/api/revalidate", {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({ tags: ["products", "news"], paths: ["/sitemap.xml"] }),
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
  await invalidate();
  const first = await fetch(base + "/sitemap.xml");
  assert.equal(first.status, 200);
  const xml = await first.text();
  assert.ok(xml.includes("/news/first"));
  // URL 结构：产品使用规范嵌套地址 /products/{category}/{slug}；新闻与静态页不带 lastmod。
  const blocks = xml.split("<url>").slice(1).map(block => block.slice(0, block.indexOf("</url>")));
  const blockFor = fragment => blocks.find(block => block.includes(fragment));
  const productBlock = blockFor("/products/compact-camera/fixture-camera");
  assert.ok(productBlock, "sitemap must use canonical nested product URLs");
  assert.ok(productBlock.includes("2026-08-10T12:00:00"), "product lastmod must come from updated_time");
  assert.ok(!blockFor("/news/first").includes("<lastmod>"), "news has no reliable update time");
  assert.ok(!blockFor("/about").includes("<lastmod>"), "static routes must not claim a lastmod");
  const count = calls;
  const second = await fetch(base + "/sitemap.xml");
  assert.equal(await second.text(), xml);
  assert.equal(calls, count, "warm sitemap must not call the API");

  version = "published";
  await invalidate();
  const fresh = await (await fetch(base + "/sitemap.xml")).text();
  assert.ok(fresh.includes("/news/published"));
  assert.ok(!fresh.includes("/news/first"));

  incomplete = true;
  await invalidate();
  assert.equal((await fetch(base + "/sitemap.xml")).status, 500);
  incomplete = false;
  version = "recovered";
  const recovered = await fetch(base + "/sitemap.xml");
  assert.equal(recovered.status, 200);
  assert.ok((await recovered.text()).includes("/news/recovered"));
  console.log("PASS: warm cache avoids API calls; publish invalidates; incomplete pagination fails; recovery succeeds.");
} finally {
  // Do not leave mock sitemap entries in the local production cache.
  await invalidate().catch(() => {});
  if (server.exitCode === null) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
