/**
 * @fileoverview 后端 API 客户端（Songdian B2B 后端 /api/v1）
 *
 * 封装对 FastAPI 后端（FastAPI + Tortoise ORM，端口 8000）的类型化 fetch，
 * 解析统一返回结构 Result{code,msg,data}，并把后端相对图片路径
 * （/uploads/...）补全为后端绝对 URL（http://localhost:8000/uploads/...），
 * 供 next/image 优化使用。
 *
 * 本文件同时导出与后端 DTO 对齐的原始类型，以及日期格式化等共享工具。
 *
 * @module api/client
 * @package Songdian Technology — Next.js Frontend (Backend-connected)
 */

// 后端基础 URL；构建期由 .env.local 的 NEXT_PUBLIC_API_URL 注入，缺省回退到本地 8000。
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 把后端返回的相对路径（/uploads/...）补全为后端绝对 URL，
 * 便于 next/image 跨域优化。已为绝对 URL 则原样返回。
 */
export function toAbsoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * 将 ISO 日期字符串格式化为「March 15, 2025」风格（与旧 WP 字段展示保持一致）。
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 统一的后端请求封装：
 * - 拼装 query 参数（空值自动跳过）
 * - 设置 ISR 重新验证（60 秒）
 * - 解析 Result 信封，code !== "0" 时抛错
 */
export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  options?: { revalidate?: number | false; tags?: string[] },
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // 缓存策略：默认 ISR 60 秒；options.revalidate === false 时实时拉取（no-store，
  // 用于搜索等要求实时结果的场景）；可传 tags 以支持 revalidateTag 按需刷新。
  const revalidate = options?.revalidate ?? 60;
  const cacheInit =
    revalidate === false
      ? ({ cache: "no-store" } as const)
      : ({ next: { revalidate, ...(options?.tags ? { tags: options.tags } : {}) } } as const);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    ...cacheInit,
  });

  if (!res.ok) {
    throw new Error(`后端接口请求失败：${res.status} ${path}`);
  }

  const json = (await res.json()) as { code: string; msg: string; data: T };
  if (json.code !== "0") {
    throw new Error(`后端接口返回错误：${json.code} ${json.msg}`);
  }
  return json.data;
}

// ───────────────────────── 后端原始 DTO 类型 ─────────────────────────

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
}

export interface GalleryDTO {
  id: number;
  image_url: string;
  alt: string | null;
  sort_order: number;
}

export interface AttributeDTO {
  id: number;
  name: string;
  slug: string;
  value: string;
}

export interface ProductPageDTO {
  id: number;
  slug: string;
  title: string;
  summary: string;
  sku: string | null;
  price: string | null;
  currency: string;
  stock_status: string;
  status: string;
  category: CategoryDTO | null;
  created_time: string | null;
  updated_time: string | null;
  cover_image: string | null;
  // 产品标签 —— 标签名称字符串数组（如 ["OEM","4K","Waterproof"]）；DB 为 NULL 时由后端正文兜底为空数组。
  tags: string[];
  // SEO 字段（2026-07-31 新增，后端透传，空则前端回退 title/content_html）
  seo_title: string | null;
  seo_description: string | null;
}

export interface ProductDetailDTO extends ProductPageDTO {
  content_html: string;
  galleries: GalleryDTO[];
  attributes: AttributeDTO[];
}

export interface NewsPageDTO {
  id: number;
  slug: string;
  title: string;
  summary: string;
  author: string | null;
  category: CategoryDTO | null;
  published_at: string | null;
  status: string;
  created_time: string | null;
  cover_image: string | null;
}

export interface NewsDetailDTO extends NewsPageDTO {
  content_html: string;
}

export interface SearchItemDTO {
  id: number;
  kind: string;
  title: string;
  summary: string;
  slug: string;
  url: string;
  rank: number;
  cover_image: string | null;
  sku: string | null;
  // 创建时间（ISO 字符串），用于搜索结果卡片展示可读日期；后端可能缺省，故设为可选。
  created_time?: string | null;
}

export interface SearchPageDTO {
  items: SearchItemDTO[];
  total: number;
  took_ms: number;
  degraded: boolean;
  note: string;
}

export interface PageDTO<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

/** 前端通用的分页元信息（与旧 WPagination 对齐：total / totalPages）。 */
export interface PageMeta {
  total: number;
  totalPages: number;
}
