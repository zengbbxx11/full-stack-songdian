import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import { apiFetch, ApiError } from "../lib/api/client";
import { proxy } from "../proxy";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("API deadline covers delayed headers and a stalled JSON body", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/body") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"code":"0","data":');
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    globalThis.fetch = (input, init) => originalFetch(
      "http://127.0.0.1:" + address.port + new URL(String(input)).pathname, init,
    );
    for (const path of ["/headers", "/body"]) {
      const started = Date.now();
      await expect(apiFetch(path, undefined, { revalidate: false, timeoutMs: 100 })).rejects.toBeInstanceOf(ApiError);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("API timeout retains ISR tags and real-time search cache policy", async () => {
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(init!);
    return Response.json({ code: "0", data: { ok: true } });
  };
  await expect(apiFetch("/cached", undefined, { revalidate: 300, tags: ["products"] })).resolves.toEqual({ ok: true });
  await apiFetch("/search", undefined, { revalidate: false });
  expect(calls[0]).toMatchObject({ next: { revalidate: 300, tags: ["products"] } });
  expect(calls[1]).toMatchObject({ cache: "no-store" });
  expect(calls[1]).not.toHaveProperty("next");
  expect(calls[0].signal).toBeInstanceOf(AbortSignal);
});

function request(slug: string) { return new NextRequest("http://localhost/products/" + slug + "?campaign=test"); }

test("canonical uses current category, retains query and caches explicit missing products", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ code: "0", data: { canonical_path: "/products/new-category/cache-current" } });
  };
  const response = await proxy(request("cache-current"));
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("http://localhost/products/new-category/cache-current?campaign=test");
  await proxy(request("cache-current"));
  expect(calls).toBe(1);
  globalThis.fetch = async () => { calls++; return Response.json({ code: "A010001" }, { status: 404 }); };
  const missing = await proxy(request("dc417x"));
  expect(missing.status).toBe(200);
  expect(missing.headers.get("location")).toBeNull();
  await proxy(request("dc417x"));
  expect(calls).toBe(2);
});

test("canonical negative cache has a finite capacity", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ code: "A010001" }, { status: 404 }); };
  for (let i = 0; i < 513; i++) await proxy(request("capacity-" + i));
  const before = calls;
  await proxy(request("capacity-512"));
  expect(calls).toBe(before);
  await proxy(request("capacity-0"));
  expect(calls).toBe(before + 1);
});

test("malformed backend response is not cached and recovers on the next request", async () => {
  globalThis.fetch = async () => new Response("invalid JSON", { status: 200 });
  await proxy(request("recoverable"));
  globalThis.fetch = async () => Response.json({ code: "0", data: { canonical_path: "/products/current/recoverable" } });
  expect((await proxy(request("recoverable"))).status).toBe(308);
});

test("canonical lookup aborts a stalled backend", async () => {
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
  });
  const started = Date.now();
  const response = await proxy(request("deadline-missing"));
  expect(response.status).toBe(200);
  expect(Date.now() - started).toBeGreaterThanOrEqual(1800);
  expect(Date.now() - started).toBeLessThan(4000);
});

test("canonical entries expire and backend recovery overrides fallback", async () => {
  const realNow = Date.now;
  let now = realNow();
  let calls = 0;
  Date.now = () => now;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ code: "0", data: { canonical_path: "/products/category/expiry" } });
    };
    await proxy(request("expiry"));
    now += 60_001;
    await proxy(request("expiry"));
    expect(calls).toBe(2);
  } finally { Date.now = realNow; }

  globalThis.fetch = async () => { throw new TypeError("offline"); };
  const fallback = await proxy(request("dc226"));
  expect(fallback.status).toBe(308);
  globalThis.fetch = async () => Response.json({ code: "A010001" }, { status: 404 });
  const unpublished = await proxy(request("dc226"));
  expect(unpublished.status).toBe(200);
  expect(unpublished.headers.get("location")).toBeNull();
});
