import { expect, test } from "@playwright/test";
import { apiFetch, ApiError } from "../lib/api/client";
import { getAllPostSlugs, getPostBySlug } from "../lib/api/news";
import { articleSchema } from "../lib/seo";

// Exercise the real data adapters with isolated responses; no backend data is changed.
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("news distinguishes missing content from service and malformed response failures", async () => {
  for (const status of [429, 500, 502, 503]) {
    globalThis.fetch = async () => Response.json({ code: "B999001" }, { status });
    await expect(getPostBySlug("fixture")).rejects.toMatchObject({ name: "ApiError", status });
  }
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await expect(getPostBySlug("fixture")).rejects.toBeInstanceOf(ApiError);
  globalThis.fetch = async () => Response.json(null);
  await expect(getPostBySlug("fixture")).rejects.toBeInstanceOf(ApiError);
  globalThis.fetch = async () => new Response("not json", { status: 502 });
  await expect(apiFetch("/api/v1/news/fixture")).rejects.toMatchObject({ status: 502 });
  globalThis.fetch = async () => Response.json({ code: "A020001" });
  expect(await getPostBySlug("missing")).toBeNull();
  globalThis.fetch = async () => Response.json({ code: "C404001" }, { status: 404 });
  expect(await getPostBySlug("missing")).toBeNull();
});

test("article metadata preserves the publication instant without inventing an update", async () => {
  const published = "2026-09-01T16:30:00+00:00";
  globalThis.fetch = async () => Response.json({ code: "0", data: {
    id: 1, slug: "fixture", title: "Fixture", summary: "Fixture summary",
    content_html: "<p>Fixture</p>", published_at: published,
    created_time: "2026-08-01T00:00:00+00:00", category: null, cover_image: null,
  } });
  const post = await getPostBySlug("fixture");
  expect(post?.date).toBe(published);
  expect(post?.modified).toBe("");
  const schema = articleSchema({ title: "Fixture", description: "", datePublished: post!.date,
    dateModified: post!.modified, author: "Fixture", url: "/news/fixture" });
  expect(schema.datePublished).toBe(published);
  expect(JSON.parse(JSON.stringify(schema))).not.toHaveProperty("dateModified");
});

// sitemap() 现在是「运行时生成 + Next 显式数据缓存」的路由，内部调用 connection()，
// 只能在请求上下文里执行，不能在 Node 中直接调用。其缓存复用、发布失效、不完整分页失败
// 与恢复，以及产品规范 URL / lastModified 的输出，由 scripts/verify-sitemap-cache.mjs
// 针对真实的 next start 服务验证；这里只保留不依赖请求上下文的构建期 slug 发现降级。
test("build-time slug discovery tolerates API outages", async () => {
  globalThis.fetch = async () => Response.json({ code: "B999001" }, { status: 503 });
  expect(await getAllPostSlugs()).toEqual([]);
});
