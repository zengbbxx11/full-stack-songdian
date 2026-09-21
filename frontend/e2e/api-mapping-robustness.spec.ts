import { test, expect } from "@playwright/test";
import { decodeHtmlEntities, normalizeCategoryName, normalizePublicSummary, normalizePublicText } from "../lib/display-text";
import { getPosts } from "../lib/api/news";
import { getProductBySlug, getProducts } from "../lib/api/products";
import { search } from "../lib/api/search";

/**
 * 后端字段缺失时的映射健壮性。
 *
 * 背景：详情页与列表页共用同一套 DTO → 应用层映射，但详情页没有列表页那层
 * try/catch，任何 undefined 字段都会冒泡成 TypeError（渲染 error.tsx / HTTP 500，
 * 进而让 Lighthouse 的 http-status-code 审计失败）。这些用例锁住兜底口径。
 */

/** 用一次性 stub 替换 globalThis.fetch，返回统一 Result 信封。 */
function stubEnvelope(data: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ code: "0", msg: "", data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("display-text helpers tolerate missing backend text", () => {
  expect(normalizePublicText(undefined)).toBe("");
  expect(normalizePublicText(null)).toBe("");
  expect(decodeHtmlEntities(undefined)).toBe("");
  expect(normalizePublicSummary(null)).toBe("");
  // 数字等非字符串也不应抛错（旧实现假定入参一定是字符串）
  expect(normalizeCategoryName(undefined)).toBe("");
  expect(normalizePublicText("Songdian;s &amp; UP to 20inch")).toBe("Songdian's & Up to 20-inch");
});

test("product detail mapping survives missing galleries and attributes", async () => {
  // 后端 DTO 声明 galleries/attributes 必填，但真实响应可能缺失；详情页没有兜底 try/catch。
  const restore = stubEnvelope({
    id: 1, slug: "dc403", title: "DC403", summary: null, content_html: "", cover_image: null,
    category: null, tags: null, price: "", galleries: undefined, attributes: undefined,
  });
  try {
    const detail = await getProductBySlug("dc403");
    expect(detail?.name).toBe("DC403");
    expect(detail?.images).toEqual([]);
    expect(detail?.gallery).toEqual([]);
    expect(detail?.attributes).toEqual([]);
  } finally {
    restore();
  }
});

test("product list mapping survives a missing list envelope", async () => {
  const restore = stubEnvelope({});
  try {
    const { products, pagination } = await getProducts({ page: 1 });
    expect(products).toEqual([]);
    expect(pagination).toEqual({ total: 0, totalPages: 1 });
  } finally {
    restore();
  }
});

test("news list mapping survives a missing list envelope", async () => {
  const restore = stubEnvelope({});
  try {
    const { posts, pagination } = await getPosts({ page: 1 });
    expect(posts).toEqual([]);
    expect(pagination).toEqual({ total: 0, totalPages: 1 });
  } finally {
    restore();
  }
});

test("search mapping tolerates missing items and rejects protocol-relative urls", async () => {
  const restore = stubEnvelope({ items: undefined, total: undefined, took_ms: undefined, degraded: undefined });
  try {
    const empty = await search("camera");
    expect(empty.items).toEqual([]);
    expect(empty.total).toBe(0);
    expect(empty.degraded).toBe(false);
  } finally {
    restore();
  }

  // 协议相对地址（//evil.example.com）同样以 "/" 开头，必须回退到本地拼接
  const restoreHostile = stubEnvelope({
    items: [{ id: 1, kind: "product", title: "DC403", summary: "", slug: "dc403", url: "//evil.example.com/phish", rank: 1, cover_image: null, sku: null, created_time: null }],
    total: 1,
    took_ms: 1,
    degraded: false,
  });
  try {
    const result = await search("camera");
    expect(result.items[0].url).toBe("/products/dc403");
  } finally {
    restoreHostile();
  }
});


test("banner parsing preserves malformed slots and rejects invalid image URLs", async () => {
  const { parseHomeBanners } = await import("../lib/api/settings");
  const banners = parseHomeBanners(JSON.stringify([
    null,
    { url: "/uploads/second.webp", enabled: true, href: "/products" },
    { url: "https://", enabled: true },
  ]));
  expect(banners).toHaveLength(2);
  expect(banners[0].url).toBe("");
  expect(banners[1].url).toContain("/uploads/second.webp");
  expect(banners[1].href).toBe("/products");
  expect(parseHomeBanners(JSON.stringify([[], { url: "/uploads/second.webp", enabled: false }]))).toEqual([
    { url: "", mobileUrl: "", href: "" },
  ]);
});
