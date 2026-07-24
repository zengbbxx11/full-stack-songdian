/**
 * @fileoverview WordPress + WooCommerce REST API 客户端
 *
 * ⚠️【注意】此文件为 WordPress 遗留客户端。产品/新闻数据已迁移至后端 FastAPI
 * （/api/v1/products、/api/v1/news 等），新功能请使用 lib/api/ 下的客户端。
 * 本文件仅保留用于兼容旧的 WordPress 数据源或调试对照。
 *
 * 为 WordPress REST API（wp/v2）和 WooCommerce REST API（wc/v3）提供类型化的
 * fetch 封装器与数据获取函数。处理身份认证、ISR 重新验证、请求超时、分页解析，
 * 并将原始 WP/WC 响应转换为 Next.js 前端使��的应用层类型。
 *
 * @module wordpress
 * @package Songdian Technology — Next.js WordPress Headless B2B Website
 */

import type {
  WPPost,
  WPPage,
  WPCategory,
  WPTag,
  WPPagination,
  WCProduct,
  WCProductCategory,
  WCProductImage,
  WCAttribute,
  PostSummary,
  PostDetail,
  PageDetail,
  ProductSummary,
  ProductDetail,
} from "@/lib/types";
import { cache } from "react";

/** WordPress REST API 基础 URL，开发环境默认为 localhost */
const WP_URL = process.env.NEXT_PUBLIC_WORDPRESS_URL || "http://localhost:10004";
/** WordPress v2 API 命名空间端点 */
const WP_API = `${WP_URL}/wp-json/wp/v2`;
/** WooCommerce v3 API 命名空间端点 */
const WC_API = `${WP_URL}/wp-json/wc/v3`;

// ============================================================
// 通用 fetch 封装器
// ============================================================

/**
 * WordPress REST API（wp/v2）的通用类型化 fetch 封装器。
 *
 * 自动处理 AbortController 超时、发送 JSON content-type 头，
 * 通过 Next.js `next.revalidate` 选项应用 ISR 重新验证，
 * 并从 `X-WP-TotalPages` 与 `X-WP-Total` 响应头解析分页元数据。
 *
 * @typeParam T - JSON 响应体的预期类型
 * @param endpoint - 相对于 wp/v2 基础路径的 WP API 路径（如 `/posts?per_page=10`）
 * @param options   - 标准 `fetch` 选项，扩展了可选的 `timeout`（毫秒）
 * @returns 包含解析后的 `data` 与可选 `pagination` 元数据的对象
 * @throws {Error} 当响应非 OK 或请求超时时抛出
 */
async function wpFetch<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number; revalidate?: number | false }
): Promise<{ data: T; pagination?: WPPagination }> {
  const controller = new AbortController();
  const timeout = options?.timeout || 15000;
  const timer = setTimeout(() => controller.abort(), timeout);

  const { revalidate, ...fetchOptions } = options || {};

  try {
    const res = await fetch(`${WP_API}${endpoint}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...fetchOptions?.headers },
      next: revalidate !== undefined
        ? { revalidate }
        : { revalidate: Number(process.env.NEXT_PUBLIC_ISR_REVALIDATE) || 60 },
    });

    if (!res.ok) throw new Error(`WP API Error: ${res.status}`);

    const data = await res.json();
    const totalPages = res.headers.get("X-WP-TotalPages");
    const total = res.headers.get("X-WP-Total");
    const pagination: WPPagination | undefined =
      totalPages && total
        ? { totalPages: parseInt(totalPages), total: parseInt(total) }
        : undefined;

    return { data, pagination };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * WooCommerce REST API（wc/v3）的通用类型化 fetch 封装器。
 *
 * 与 {@link wpFetch} 类似，但会使用 `WOOCOMMERCE_CONSUMER_KEY` 与
 * `WOOCOMMERCE_CONSUMER_SECRET` 环境变量添加 HTTP Basic 认证。
 *
 * @typeParam T - JSON 响应体的预期类型
 * @param endpoint - 相对于 wc/v3 基础路径的 WC API 路径（如 `/products`）
 * @param options   - 标准 `fetch` 选项，扩展了可选的 `timeout`（毫秒）
 * @returns 包含解析后的 `data` 与可选 `pagination` 元数据的对象
 * @throws {Error} 当响应非 OK 或请求超时时抛出
 */
async function wcFetch<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<{ data: T; pagination?: WPPagination }> {
  const ck = process.env.WOOCOMMERCE_CONSUMER_KEY || "";
  const cs = process.env.WOOCOMMERCE_CONSUMER_SECRET || "";

  const controller = new AbortController();
  const timeout = options?.timeout || 15000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    /** Base64 编码的 consumer key:secret 对，用于 Basic Auth */
    const auth = Buffer.from(`${ck}:${cs}`).toString("base64");
    const res = await fetch(`${WC_API}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        ...options?.headers,
      },
      next: { revalidate: Number(process.env.NEXT_PUBLIC_ISR_REVALIDATE) || 60 },
    });

    if (!res.ok) throw new Error(`WC API Error: ${res.status}`);

    const data = await res.json();
    const totalPages = res.headers.get("X-WP-TotalPages");
    const total = res.headers.get("X-WP-Total");
    const pagination: WPPagination | undefined =
      totalPages && total
        ? { totalPages: parseInt(totalPages), total: parseInt(total) }
        : undefined;

    return { data, pagination };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("WooCommerce API request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 工具辅助函数
// ============================================================

/**
 * 去除字符串中的所有 HTML 标签并解码常见 HTML 实体。
 * 用于从 WordPress 的 `rendered` 字段生成纯文本摘要。
 *
 * @param html - WordPress API 返回的原始 HTML 字符串
 * @returns 清理后的纯文本字符串
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))  // &#8217; → '
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "...")
    .trim();
}

/**
 * 从 WordPress 文章、页面或 WooCommerce 产品对象中提取特色图片 URL 与 alt 文本。
 * 同时兼容 WP REST 的 `_embedded` 媒体与 WC REST 的 `images` 数组。
 *
 * @param post - WP 文章、页面或 WC 产品原始 API 对象
 * @returns 包含 `url`（可为 null）与 `alt` 文本的对象
 */
function getFeaturedImage(post: WPPost | WPPage | WCProduct): { url: string | null; alt: string } {
  // WP 文章/页面嵌入式特色媒体
  const wpMedia = (post as WPPost)._embedded?.["wp:featuredmedia"]?.[0];
  if (wpMedia) return { url: wpMedia.source_url, alt: wpMedia.alt_text || (post as WPPost).title.rendered };

  // WC 产品 images 数组（第一张 = 特色图）
  const wcImages = (post as WCProduct).images;
  if (wcImages?.length) return { url: wcImages[0].src, alt: wcImages[0].alt || (post as WCProduct).name };

  return { url: null, alt: "" };
}

/**
 * 将 ISO 8601 日期字符串格式化为人类可读的美式英文日期。
 *
 * @param dateStr - ISO 日期字符串（如 `2025-03-15T10:30:00`）
 * @returns 格式化后的日期字符串，如 `"March 15, 2025"`
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ============================================================
// 文章 API
// ============================================================

/**
 * 获取分页的 WordPress 博客文章列表。
 *
 * @param params - 可选的筛选/分页参数
 * @param params.page       - 页码（从 1 开始）
 * @param params.perPage    - 每页文章数（默认 10）
 * @param params.categoryId - 按分类 ID 筛选
 * @param params.tagId      - 按标签 ID 筛选
 * @param params.search     - 搜索查询字符串
 * @returns 包含 {@link PostSummary} 数组与分页元数据的对象
 */
export async function getPosts(params?: {
  page?: number;
  perPage?: number;
  categoryId?: number;
  tagId?: number;
  search?: string;
}): Promise<{ posts: PostSummary[]; pagination: WPPagination }> {
  const query = new URLSearchParams({
    _embed: "true",
    per_page: String(params?.perPage || 10),
    page: String(params?.page || 1),
  });
  if (params?.categoryId) query.set("categories", String(params.categoryId));
  if (params?.tagId) query.set("tags", String(params.tagId));
  if (params?.search) query.set("search", params.search);

  const { data, pagination } = await wpFetch<WPPost[]>(`/posts?${query}`);

  const posts: PostSummary[] = data.map((post) => {
    const img = getFeaturedImage(post);
    const author = post._embedded?.author?.[0];
    const terms = post._embedded?.["wp:term"]?.[0] as WPCategory[] | undefined;

    return {
      id: post.id,
      slug: post.slug,
      title: post.title.rendered,
      excerpt: stripHtml(post.excerpt.rendered),
      featuredImage: img.url,
      featuredImageAlt: img.alt,
      date: formatDate(post.date),
      author: author?.name || "Admin",
      categories: terms?.map((c) => ({ id: c.id, name: c.name, slug: c.slug })) || [],
    };
  });

  return { posts, pagination: pagination! };
}

/**
 * 通过 slug 获取单篇博客文章的全部详情（内容、作者、标签等）。
 *
 * @param slug - WordPress 文章 slug
 * @returns {@link PostDetail} 对象，未找到则返回 `null`
 */
export async function getPostBySlug(slug: string): Promise<PostDetail | null> {
  const { data } = await wpFetch<WPPost[]>(`/posts?slug=${encodeURIComponent(slug)}&_embed=true`);
  if (!data.length) return null;

  const post = data[0];
  const img = getFeaturedImage(post);
  const author = post._embedded?.author?.[0];
  const categories = (post._embedded?.["wp:term"]?.[0] as WPCategory[]) || [];
  const tags = (post._embedded?.["wp:term"]?.[1] as WPTag[]) || [];

  return {
    id: post.id,
    slug: post.slug,
    title: post.title.rendered,
    content: post.content.rendered,
    excerpt: stripHtml(post.excerpt.rendered),
    featuredImage: img.url,
    featuredImageAlt: img.alt,
    date: formatDate(post.date),
    modified: post.modified,
    author: author?.name || "Admin",
    authorAvatar: author?.avatar_urls?.["96"] || "",
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  };
}

/**
 * 获取所有已发布文章的 slug（最多 100 个）。
 * 用于静态站点生成（`generateStaticParams`）与 sitemap 生成。
 *
 * @returns 文章 slug 字符串数组
 */
export async function getAllPostSlugs(): Promise<string[]> {
  const { data } = await wpFetch<WPPost[]>("/posts?_fields=slug&per_page=100");
  return data.map((p) => p.slug);
}

/**
 * 获取指定文章的「上一篇 / 下一篇」导航数据。
 *
 * 以新闻列表一致的顺序（发布时间降序，最新在前）定位相邻文章：
 *   - prev（上一篇）：时间更晚（列表中更靠前）的文章
 *   - next（下一篇）：时间更早（列表中更靠后）的文章
 *
 * 仅请求 `id / slug / title / date` 字段，避免拉取特色图与 _embed，体积更小。
 * 文章总数极少（站点当前约 8 篇），`per_page=100` 一次取全。
 *
 * @param slug - 当前文章 slug
 * @returns 含 `prev` 与 `next` 的对象；到边界时对应项为 `null`
 */
export async function getAdjacentPosts(slug: string): Promise<{
  prev: { slug: string; title: string; date: string } | null;
  next: { slug: string; title: string; date: string } | null;
}> {
  const { data } = await wpFetch<WPPost[]>(
    "/posts?_fields=id,slug,title,date&per_page=100&orderby=date&order=desc"
  );
  const idx = data.findIndex((p) => p.slug === slug);
  if (idx === -1) return { prev: null, next: null };

  const map = (p?: WPPost) =>
    p ? { slug: p.slug, title: p.title.rendered, date: formatDate(p.date) } : null;

  return {
    prev: map(data[idx - 1]),
    next: map(data[idx + 1]),
  };
}

// ============================================================
// 页面 API
// ============================================================

/**
 * 通过 slug 获取单个 WordPress 页面。
 *
 * @param slug - WordPress 页面 slug
 * @returns {@link PageDetail} 对象，未找到则返回 `null`
 */
export async function getPageBySlug(slug: string): Promise<PageDetail | null> {
  const { data } = await wpFetch<WPPage[]>(`/pages?slug=${encodeURIComponent(slug)}&_embed=true`);
  if (!data.length) return null;

  const page = data[0];
  const img = getFeaturedImage(page);

  return {
    id: page.id,
    slug: page.slug,
    title: page.title.rendered,
    content: page.content.rendered,
    excerpt: stripHtml(page.excerpt.rendered),
    featuredImage: img.url,
    modified: page.modified,
  };
}

// ============================================================
// 分类 / 标签 API
// ============================================================

/**
 * 获取所有 WordPress 文章分类，按字母排序（最多 50 个）。
 *
 * @returns {@link WPCategory} 对象数组
 */
export async function getCategories(): Promise<WPCategory[]> {
  const { data } = await wpFetch<WPCategory[]>("/categories?per_page=50&orderby=name&order=asc");
  return data;
}

/**
 * 获取所有 WordPress 文章标签，按字母排序（最多 50 个）。
 *
 * @returns {@link WPTag} 对象数组
 */
export async function getTags(): Promise<WPTag[]> {
  const { data } = await wpFetch<WPTag[]>("/tags?per_page=50&orderby=name&order=asc");
  return data;
}

// ============================================================
// 产品 API（通过 WP REST 访问 WooCommerce 产品自定义文章类型）
// ============================================================

/**
 * 通过 WP REST API 获取分页的 WooCommerce 产品列表。
 *
 * 使用 `product` 自定义文章类型端点（而非 WC v3 API），
 * 将内嵌媒体与分类术语映射为 {@link ProductSummary} 对象。
 *
 * @param params - 可选的筛选/分页参数
 * @param params.page     - 页码（从 1 开始）
 * @param params.perPage  - 每页产品数（默认 12）
 * @param params.category - 按产品分类 ID 筛选
 * @param params.featured - 是否仅筛选推荐产品（WP REST 中产品暂不支持此功能；保留供将来使用）
 * @param params.search   - 搜索查询字符串
 * @returns 包含 {@link ProductSummary} 数组与可选分页信息的对象
 */
export async function getProducts(params?: {
  page?: number;
  perPage?: number;
  category?: number;
  featured?: boolean;
  search?: string;
}): Promise<{ products: ProductSummary[]; pagination: WPPagination | null }> {
  try {
    const query = new URLSearchParams({
      _embed: "true",
      per_page: String(params?.perPage || 12),
      page: String(params?.page || 1),
    });
    if (params?.category) query.set("product_cat", String(params.category));
    if (params?.search) query.set("search", params.search);

    const { data, pagination } = await wpFetch<WPPost[]>(`/product?${query}`);

    const products: ProductSummary[] = data.map((p) => {
      const media = p._embedded?.["wp:featuredmedia"]?.[0];
      // 产品分类位于 wp:term[1]（taxonomy=product_cat）
      const productCats = (p._embedded?.["wp:term"]?.[1] || []) as unknown as WCProductCategory[];
      const productTags = (p._embedded?.["wp:term"]?.[2] || []) as unknown as WPTag[];

      return {
        id: p.id,
        slug: p.slug,
        name: p.title.rendered,
        shortDescription: stripHtml(p.excerpt.rendered),
        price: "",
        regularPrice: "",
        salePrice: "",
        onSale: false,
        featured: false,
        image: media?.source_url || null,
        imageAlt: media?.alt_text || p.title.rendered,
        categories: productCats.map((c: { id: number; name: string; slug: string }) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
        // 标签仅取名称字符串，与后端契约（string[]）对齐
        tags: productTags.map((t: { id: number; name: string; slug: string }) => t.name),
        stockStatus: "instock",
      };
    });

    return { products, pagination: pagination || null };
  } catch {
    return { products: [], pagination: null };
  }
}

/**
 * 通过 slug 获取单个产品的全部详情，包括由 `wc-product-specs-rest.php`
 * 自定义插件注入的 WC 自定义字段（价格、SKU、库存、图库、属性）。
 *
 * @param slug - WooCommerce 产品 slug
 * @returns {@link ProductDetail} 对象，未找到则返回 `null`
 */
export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  try {
    const { data } = await wpFetch<WPPost[]>(
      `/product?slug=${encodeURIComponent(slug)}&_embed=true`
    );
    if (!data.length) return null;

    const p = data[0];
    const images = p._embedded?.["wp:featuredmedia"]
      ? [p._embedded["wp:featuredmedia"][0]].map((m) => ({
          id: m.id,
          date_created: m.date,
          src: m.source_url,
          name: m.title.rendered,
          alt: m.alt_text || "",
        }))
      : [];
    const productCats = (p._embedded?.["wp:term"]?.[1] || []) as unknown as WCProductCategory[];
    const productTags = (p._embedded?.["wp:term"]?.[2] || []) as unknown as WPTag[];

    // 自定义插件注入的 WC REST 字段（wc-product-specs-rest.php）
    const pAny = p as unknown as Record<string, unknown>;
    const wcAttrs = (pAny.wc_attributes || []) as WCAttribute[];
    const wcSku = (pAny.wc_sku as string) || "";
    const wcPrice = (pAny.wc_price as string) || "";
    const wcStock = (pAny.wc_stock as string) || "instock";
    const wcGalleryRaw = (pAny.wc_gallery || []) as WCProductImage[];

    return {
      id: p.id,
      slug: p.slug,
      name: p.title.rendered,
      description: p.content.rendered,
      shortDescription: stripHtml(p.excerpt.rendered),
      price: wcPrice,
      regularPrice: wcPrice,
      salePrice: "",
      priceHtml: wcPrice ? `$${wcPrice}` : "",
      onSale: false,
      sku: wcSku,
      images: [...images, ...wcGalleryRaw],
      gallery: wcGalleryRaw,
      categories: productCats.map((c: { id: number; name: string; slug: string }) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
      // 标签仅取名称字符串，与后端契约（string[]）对齐
      tags: productTags.map((t: { id: number; name: string; slug: string }) => t.name),
      attributes: wcAttrs,
      relatedIds: [],
      stockStatus: wcStock === "instock" ? "instock" : "outofstock",
      dateModified: p.modified,
    };
  } catch {
    return null;
  }
});

/**
 * 获取所有已发布产品的 slug（最多 100 个）。
 * 用于静态站点生成（`generateStaticParams`）与 sitemap 生成。
 *
 * @returns 产品 slug 字符串数组
 */
export async function getAllProductSlugs(): Promise<string[]> {
  try {
    const { data } = await wpFetch<WPPost[]>(
      "/product?_fields=slug&per_page=100",
      { revalidate: 3600 }
    );
    return data.map((p) => p.slug);
  } catch {
    return [];
  }
}

/**
 * 获取所有 WooCommerce 产品分类，按字母排序（最多 50 个）。
 *
 * @returns {@link WCProductCategory} 对象数组
 */
export async function getProductCategories(): Promise<WCProductCategory[]> {
  try {
    const { data } = await wpFetch<WCProductCategory[]>(
      "/product_cat?per_page=50&orderby=name&order=asc",
      { revalidate: 3600 }
    );
    return data;
  } catch {
    return [];
  }
}

// ============================================================
// SEO 辅助：收集所有站点 URL 用于 sitemap 生成
// ============================================================

/**
 * 从 WordPress 页面获取 Banner 图片 URL。
 * 读取 slug 为 "home-banner" 的页面的特色图片。
 * 若页面不存在或无特色图片，则返回 null（由调用方回退到 media.ts 中的静态 URL）。
 *
 * 换图流程：WordPress 后台 → 页面 "home-banner" → 设置特色图片 → 保存 → 网站自动刷新（ISR）
 */
export async function getSiteBanner(): Promise<string | null> {
  try {
    const page = await getPageBySlug("home-banner");
    if (page?.featuredImage) return page.featuredImage;
    return null;
  } catch {
    return null;
  }
}

/**
 * 收集所有站点 URL 用于生成 sitemap.xml（已废弃）。
 *
 * @deprecated 自 2026-07 起不再使用。sitemap 改由 app/sitemap.ts 独立生成，
 *             后者直接使用 getAllPostSlugs / getAllProductSlugs 并正确生成
 *             /news/[slug] 和 /products/[slug] 路由。
 *             此函数保留仅作参考，将在下一大版本中移除。
 */
export async function getAllSiteUrls() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // 静态页面
  const staticUrls = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1.0 },
    { url: `${siteUrl}/products`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.8 },
    { url: `${siteUrl}/solutions`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 },
    { url: `${siteUrl}/inquiry`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${siteUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.7 },
  ];

  // 动态：文章
  let postSlugs: string[] = [];
  let productSlugs: string[] = [];
  try {
    postSlugs = await getAllPostSlugs();
    productSlugs = await getAllProductSlugs();
  } catch { /* 忽略 — 若 slug 获取失败则返回部分结果 */ }

  const postUrls = postSlugs.map((slug) => ({
    url: `${siteUrl}/blog/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const productUrls = productSlugs.map((slug) => ({
    url: `${siteUrl}/products/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticUrls, ...postUrls, ...productUrls];
}
