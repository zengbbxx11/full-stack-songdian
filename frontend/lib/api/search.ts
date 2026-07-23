/**
 * @fileoverview 联合搜索数据访问（对接后端 /api/v1/search）
 *
 * 将后端 SearchItemVO 转换为前端搜索结果项（含按类型生成的跳转 URL 与
 * 补全后的封面绝对 URL）。
 *
 * @module api/search
 */

import { apiFetch, toAbsoluteUrl, type SearchPageDTO } from "./client";

export interface SearchResultItem {
  id: number;
  kind: "product" | "news";
  title: string;
  summary: string;
  slug: string;
  url: string;
  rank: number;
  coverImage: string | null;
  sku: string | null;
  // 创建时间（已格式化为可读日期的源头数据），用于卡片底部展示。
  createdTime: string | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  // 后端搜索耗时（毫秒），用于结果区角落低调展示。
  tookMs: number;
  degraded: boolean;
  note: string;
}

/** 执行产品 + 新闻联合搜索。空关键词直接返回空结果，不请求后端。 */
export async function search(
  q: string,
  opts?: { type?: "all" | "product" | "news"; page?: number; pageSize?: number },
): Promise<SearchResult> {
  const query = (q || "").trim();
  // 空查询：不请求后端，耗时记为 0（补全 tookMs 以满足 SearchResult 类型）
  if (!query) return { items: [], total: 0, tookMs: 0, degraded: false, note: "" };

  const data = await apiFetch<SearchPageDTO>("/api/v1/search", {
    q: query,
    type: opts?.type || "all",
    page: opts?.page || 1,
    page_size: opts?.pageSize || 20,
  });

  const items: SearchResultItem[] = data.items.map((it) => ({
    id: it.id,
    kind: it.kind === "product" ? "product" : "news",
    title: it.title,
    summary: it.summary,
    slug: it.slug,
    url: it.kind === "product" ? `/products/${it.slug}` : `/news/${it.slug}`,
    rank: it.rank,
    coverImage: toAbsoluteUrl(it.cover_image),
    sku: it.sku ?? null,
    createdTime: it.created_time ?? null,
  }));

  return { items, total: data.total, tookMs: data.took_ms ?? 0, degraded: data.degraded, note: data.note };
}
