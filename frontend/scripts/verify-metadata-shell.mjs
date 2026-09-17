/*
 * 文件：scripts/verify-metadata-shell.mjs
 * 职责：读取某个页面响应的**首个分片**（= Next 冲出的「首屏外壳」），报告 title / description /
 *       canonical 是否已在 `<head>` 内。用于验证 `next.config.ts` 的 `htmlLimitedBots` 兜底：
 *       外壳里没有元数据时，浏览器（Lighthouse、不执行 JS 的抓取方）会读到不完整的 head。
 *
 * 用法：node scripts/verify-metadata-shell.mjs [URL] [UA]
 *   URL 默认 http://127.0.0.1:3000/news；UA 默认 HeadlessChrome（与 Lighthouse 一致）。
 *
 * 复现「外壳不带元数据」的条件（2026-09-17 事故）：
 *   1) 起一个慢 API 代理：node scripts/slow-api-proxy.mjs（8010 -> 8000，延迟 1.2s）
 *   2) 清掉渲染/数据缓存：rmdir /s /q .next\cache（Windows）
 *   3) 用慢代理起服务：INTERNAL_API_URL=http://127.0.0.1:8010 next start -p 3000
 *   4) 跑本脚本（带一个没被访问过的查询串，保证冷渲染）
 *   外壳里 title/description/canonical 全无 = 复现成功；htmlLimitedBots 兜底生效后应全部在 head 内。
 */
const url = process.argv[2] ?? "http://127.0.0.1:3000/news";
const ua =
  process.argv[3] ??
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36";

async function main() {
  const res = await fetch(url, { headers: { "user-agent": ua } });
  if (!res.body) {
    console.log(`请求失败：status=${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let shell = "";
  let chunks = 0;
  while (shell.length < 6000) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks += 1;
    shell += decoder.decode(value, { stream: true });
  }

  let rest = "";
  let next;
  while (!(next = await reader.read()).done) rest += decoder.decode(next.value, { stream: true });
  const full = shell + rest;

  const report = (label, text) =>
    console.log(
      `${label}: bytes=${text.length} </head>@${text.indexOf("</head>")} ` +
        `title@${text.indexOf("<title>")} description@${text.indexOf('name="description"')} ` +
        `canonical@${text.indexOf('rel="canonical"')}`
    );

  const headEnd = full.indexOf("</head>");
  const inHead = (index) => index >= 0 && index < headEnd;

  console.log(`URL=${url}\nUA=${ua}\n分片数=${chunks} status=${res.status}`);
  report("首屏外壳", shell);
  report("完整文档", full);

  const complete = inHead(full.indexOf("<title>")) && inHead(full.indexOf('name="description"')) && inHead(full.indexOf('rel="canonical"'));
  console.log(
    `结论：首屏外壳含 </head> = ${shell.includes("</head>")}；` +
      `完整文档中 title/description/canonical 均在 head 内 = ${complete}` +
      (shell.includes("<title>") ? "" : "（外壳里没有 title：首屏 HTML 缺页面级 metadata，htmlLimitedBots 兜底未生效）")
  );
}

main().catch((error) => console.log(`探针执行失败：${error instanceof Error ? error.message : error}`));
