import { expect, test } from "@playwright/test";
import { apiFetch } from "../../admin-next/src/lib/api-client";
import { settleBatch } from "../../admin-next/src/lib/batch";
import { mergeVisibleOrder } from "../../admin-next/src/lib/content-order";

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const success = (data: unknown = null) => Response.json({ code: "0", data });
const unauthorized = () => Response.json({ code: "C401001" }, { status: 401 });

test("concurrent and late 401 responses share one refresh and each retry once", async () => {
  let refreshes = 0;
  let releaseLate!: () => void;
  const late = new Promise<void>(resolve => { releaseLate = resolve; });
  const counts = new Map<string, number>();
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith("/refresh")) { refreshes++; return success(); }
    const count = (counts.get(url) || 0) + 1;
    counts.set(url, count);
    if (count > 1) return success(url);
    if (url.endsWith("/late")) await late;
    return unauthorized();
  };
  const pendingLate = apiFetch("/admin/late");
  const results = await Promise.all([apiFetch("/admin/a"), apiFetch("/admin/b"), apiFetch("/admin/c")]);
  releaseLate();
  expect(await pendingLate).toBe("/api/v1/admin/late");
  expect(results).toHaveLength(3);
  expect(refreshes).toBe(1);
  expect([...counts.values()]).toEqual([2, 2, 2, 2]);
});

test("temporary refresh errors are not treated as successful auth or retried indefinitely", async () => {
  let refreshes = 0;
  globalThis.fetch = async input => {
    if (String(input).endsWith("/refresh")) {
      refreshes++;
      return Response.json({ code: "B999001" }, { status: 503 });
    }
    return unauthorized();
  };
  await expect(apiFetch("/admin/profile")).rejects.toMatchObject({ status: 503 });
  expect(refreshes).toBe(1);
});

test("login errors do not rotate unrelated cookies and null data remains null", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return unauthorized(); };
  await expect(apiFetch("/admin/login", { method: "POST", body: {} })).rejects.toMatchObject({ status: 401 });
  expect(requests).toBe(1);
  globalThis.fetch = async () => success();
  expect(await apiFetch("/admin/settings", { method: "PUT", body: {} })).toBeNull();
  // 非信封响应仍兼容返回，不能对原始 JSON 值执行 in 运算而抛出 TypeError。
  globalThis.fetch = async () => Response.json("ok");
  expect(await apiFetch("/admin/settings")).toBe("ok");
});

test("logout waits for an in-flight refresh before clearing cookies", async () => {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let profileCalls = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith("/refresh")) {
      events.push("refresh-start");
      await gate;
      events.push("refresh-end");
      return success();
    }
    if (url.endsWith("/logout")) { events.push("logout"); return success(); }
    return ++profileCalls === 1 ? unauthorized() : success({ username: "Fixture" });
  };
  const profile = apiFetch("/admin/profile");
  await expect.poll(() => events).toEqual(["refresh-start"]);
  const logout = apiFetch("/admin/logout", { method: "POST" });
  release();
  await Promise.all([profile, logout]);
  expect(events).toEqual(["refresh-start", "refresh-end", "logout"]);
});

test("batch writes bound concurrency and wait for all outcomes after a failure", async () => {
  let active = 0;
  let peak = 0;
  const finished: number[] = [];
  const result = await settleBatch([1, 2, 3, 4, 5, 6], async id => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, id === 1 ? 1 : 10));
    active--; finished.push(id);
    if (id === 1) throw Error("Fixture failure");
    return id;
  });
  expect(peak).toBe(3);
  expect(finished).toHaveLength(6);
  expect(result.map(item => item.status)).toEqual(["rejected", "fulfilled", "fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
});

test("filtered ordering changes visible records while preserving hidden slots", () => {
  const all = [1, 2, 3, 4, 5].map(id => ({ id }));
  expect(mergeVisibleOrder(all, [all[4], all[1]])).toEqual([all[0], all[4], all[2], all[3], all[1]]);
  expect(() => mergeVisibleOrder(all, [{ id: 99 }])).toThrow("列表内容已变化");
});
