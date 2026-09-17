/*
 * 文件：scripts/slow-api-proxy.mjs
 * 职责：在 8010 端口做一个「慢 API」代理（默认延迟 1.2s，指向 127.0.0.1:8000），
 *       用于在本地复现 CI runner 上「后端/冷缓存让 generateMetadata 晚于外壳冲出」的条件，
 *       配合 scripts/verify-metadata-shell.mjs 验证首屏 HTML 是否带页面级 metadata。
 *
 * 用法：node scripts/slow-api-proxy.mjs
 *   SLOW_DELAY_MS=1800 node scripts/slow-api-proxy.mjs      # 自定义延迟
 *   SLOW_TARGET=http://127.0.0.1:9000 node scripts/slow-api-proxy.mjs
 * 然后：INTERNAL_API_URL=http://127.0.0.1:8010 next start -p 3000
 */
import http from "node:http";

const DELAY = Number(process.env.SLOW_DELAY_MS ?? 1200);
const TARGET = process.env.SLOW_TARGET ?? "http://127.0.0.1:8000";

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const upstream = await fetch(TARGET + req.url, {
      method: req.method,
      headers: { ...req.headers, host: "127.0.0.1:8000" },
      body: body.length ? body : undefined,
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    await new Promise((resolve) => setTimeout(resolve, DELAY));
    const headers = {};
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key)) headers[key] = value;
    });
    res.writeHead(upstream.status, headers);
    res.end(buffer);
  } catch (error) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`slow proxy error: ${error instanceof Error ? error.message : error}`);
  }
});

server.listen(8010, "127.0.0.1", () => console.log(`slow proxy on 127.0.0.1:8010 -> ${TARGET} (delay ${DELAY}ms)`));
