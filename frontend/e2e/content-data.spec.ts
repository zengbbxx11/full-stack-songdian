import { expect, test } from "@playwright/test";
import { apiFetch, ApiError } from "../lib/api/client";
import { getAllPostSlugs, getPostBySlug } from "../lib/api/news";
import sitemap from "../app/sitemap";
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

test("sitemap uses canonical product URLs and real product update timestamps", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const list = url.pathname.endsWith("/products")
      ? [{ slug: "fixture", category: { slug: "cameras" }, updated_time: "2026-08-10T12:00:00Z" }]
      : [{ slug: "fixture-news" }];
    return Response.json({ code: "0", data: { list, total: 1 } });
  };
  const result = await sitemap();
  expect(result.find(entry => entry.url.endsWith("/products/cameras/fixture"))?.lastModified)
    .toBe("2026-08-10T12:00:00Z");
  expect(result.find(entry => entry.url.endsWith("/news/fixture-news"))?.lastModified).toBeUndefined();
  expect(result.find(entry => entry.url.endsWith("/about"))?.lastModified).toBeUndefined();
});

test("runtime sitemap fails as a whole while build-time slug discovery tolerates outages", async () => {
  globalThis.fetch = async () => Response.json({ code: "B999001" }, { status: 503 });
  await expect(sitemap()).rejects.toBeInstanceOf(ApiError);
  expect(await getAllPostSlugs()).toEqual([]);
});
