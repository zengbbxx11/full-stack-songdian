import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  fs.readFileSync(new URL("../lib/api/settings.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function load(fetch, timers = {}) {
  const context = {
    exports: {}, process: { env: {} }, fetch, AbortController,
    setTimeout, clearTimeout, ...timers,
  };
  vm.runInNewContext(source, context);
  return context.exports;
}

test("GA config distinguishes missing, explicitly disabled and invalid values", () => {
  const { resolveGaId } = load();
  assert.equal(resolveGaId(null, "G-ENV123"), "G-ENV123");
  assert.equal(resolveGaId({}, "G-ENV123"), "G-ENV123");
  assert.equal(resolveGaId({ clarity_id: "test123" }, "G-ENV123"), "G-ENV123");
  assert.equal(resolveGaId({ ga_id: "" }, "G-ENV123"), null);
  assert.equal(resolveGaId({ ga_id: "<script>" }, "G-ENV123"), null);
  assert.equal(resolveGaId({ ga_id: " G-BACKEND123 " }, "G-ENV123"), "G-BACKEND123");
});

test("public settings preserve both tracking IDs with no-store", async () => {
  const api = load(async (_url, options) => {
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ code: 0, data: { ga_id: "G-TEST123", clarity_id: "test123" } }) };
  });
  const result = await api.getPublicSettingsClient();
  assert.equal(result.ga_id, "G-TEST123");
  assert.equal(result.clarity_id, "test123");
});

test("failed or malformed public responses use the failure path", async () => {
  for (const data of [null, [], "bad"]) {
    const api = load(async () => ({ ok: true, json: async () => ({ code: "0", data }) }));
    assert.equal(await api.getPublicSettingsClient(), null);
  }
  assert.equal(await load(async () => ({ ok: false })).getPublicSettingsClient(), null);
  assert.equal(await load(async () => { throw new Error("offline"); }).getPublicSettingsClient(), null);
});

test("a stalled request is aborted after the configured five-second deadline", async () => {
  let abort;
  let cleared = false;
  const api = load((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), {
    setTimeout: (fn, ms) => { assert.equal(ms, 5000); abort = fn; return 1; },
    clearTimeout: () => { cleared = true; },
  });
  const result = api.getPublicSettingsClient();
  abort();
  assert.equal(await result, null);
  assert.equal(cleared, true);
});
