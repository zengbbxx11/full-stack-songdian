import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const requests = new Map();
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: 250000, uploadThroughput: 125000 });
await page.addInitScript(() => {
  window.__audit = { lcp: 0, cls: 0 };
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__audit.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  let sessionValue = 0, sessionStart = 0, lastShift = 0;
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) {
      if (e.startTime - lastShift < 1000 && e.startTime - sessionStart < 5000) sessionValue += e.value;
      else { sessionValue = e.value; sessionStart = e.startTime; }
      lastShift = e.startTime;
      window.__audit.cls = Math.max(window.__audit.cls, sessionValue);
    }
  }).observe({ type: "layout-shift", buffered: true });
});
cdp.on("Network.requestWillBeSent", e => requests.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp, prefetch: e.request.headers["Next-Router-Prefetch"] || null }));
cdp.on("Network.responseReceived", e => Object.assign(requests.get(e.requestId) || {}, { status: e.response.status, mime: e.response.mimeType, cacheControl: e.response.headers["cache-control"] || e.response.headers["Cache-Control"], encoding: e.response.headers["content-encoding"] || e.response.headers["Content-Encoding"] }));
cdp.on("Network.loadingFinished", e => Object.assign(requests.get(e.requestId) || {}, { bytes: e.encodedDataLength, durationMs: Math.round((e.timestamp - (requests.get(e.requestId)?.start || e.timestamp)) * 1000) }));
cdp.on("Network.loadingFailed", e => Object.assign(requests.get(e.requestId) || {}, { failure: e.errorText }));
try {
  const response = await page.goto("https://www.zsaki.icu/", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(3000);
  const initial = { metrics: await page.evaluate(() => window.__audit), bytes: [...requests.values()].reduce((n,r) => n+(r.bytes || 0),0), requests: requests.size };
  for (let y = 700; y < await page.evaluate(() => document.body.scrollHeight); y += 700) {
    await page.evaluate(y => scrollTo(0,y), y);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(10000);
  const resources = [...requests.values()].sort((a,b) => (b.bytes || 0)-(a.bytes || 0));
  const result = { capturedAt: new Date().toISOString(), url: page.url(), status: response.status(), environment: { viewport: "390x844", dpr: 2, downloadMbps: 2, latencyMs: 100, cache: "disabled", phase: "cold load + one full scroll, no consent or video click" }, initial, complete: { bytes: resources.reduce((n,r)=>n+(r.bytes || 0),0), requests: resources.length }, resources };
  await writeFile(new URL("../../reports/home-resources-live.json", import.meta.url), JSON.stringify(result,null,2));
  console.log(JSON.stringify({ ...result, resources: resources.slice(0,20) },null,2));
} finally { await browser.close(); }
