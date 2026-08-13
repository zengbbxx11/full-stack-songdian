import { createServer } from "node:http";

const port = Number(process.env.MOCK_API_PORT || 8000);

const server = createServer((request, response) => {
  if (request.url === "/healthz" || request.url === "/readyz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const data = request.url?.includes("/search")
    ? { items: [], total: 0, took_ms: 0, degraded: false, note: "CI mock" }
    : request.url?.match(/\/api\/v1\/(products|news)$/)
      ? { list: [], total: 0, page: 1, page_size: 50 }
      : [];

  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ code: "0", msg: "ok", data }));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`CI mock API listening on ${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
