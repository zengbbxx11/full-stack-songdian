/**
 * @fileoverview 新闻域数据访问（对接后端 /api/v1/news 等）
 *
 * 将后端 NewsPageVO / NewsDetailVO 转换为前端组件消费的
 * PostSummary / PostDetail 应用层类型。
 *
 * @module api/news
 */

import type { PostSummary, PostDetail, WCProductCategory } from "@/lib/types";
import { cache } from "react";
import { COMPANY } from "@/lib/content-data";
import { normalizeCategoryName, normalizePublicText } from "@/lib/display-text";
import {
  apiFetch,
  ApiError,
  toAbsoluteUrl,
  formatDate,
  type CategoryDTO,
  type NewsPageDTO,
  type NewsDetailDTO,
  type PageDTO,
  type PageMeta,
} from "./client";

function newsCategoryName(name: string): string {
  const labels: Record<string, string> = { "企业动态": "Company News", "行业资讯": "Industry Insights" };
  return labels[name] || normalizeCategoryName(name);
}

/** 新闻列表默认每页数量（与原 WP 前端一致：9）。 */
export const NEWS_PER_PAGE = 9;

/** 获取新闻分类列表。 */
export const getNewsCategories = cache(async (): Promise<WCProductCategory[]> => {
  const data = await apiFetch<CategoryDTO[]>(
    "/api/v1/news-categories",
    undefined,
    { tags: ["news-categories"] },
  );
  return data.map((c) => ({ id: c.id, name: newsCategoryName(c.name), slug: c.slug }));
});

/** 分页获取新闻列表，按摘要字段映射为 PostSummary。 */
export async function getPosts(params?: {
  page?: number;
  perPage?: number;
  categoryId?: number | null;
  search?: string;
  /** 排序方式：映射到后端 order_by 参数（如 "sort_order,-created_time"） */
  sort?: string;
}): Promise<{ posts: PostSummary[]; pagination: PageMeta | null }> {
  return getPostsCached(params?.page || 1, params?.perPage || NEWS_PER_PAGE, params?.categoryId ?? undefined, params?.search || undefined, params?.sort || undefined);
}

// Primitive keys let metadata and body share one result, even with separate options objects.
const getPostsCached = cache(async (page: number, perPage: number, category: number | undefined, search: string | undefined, sort: string | undefined): Promise<{ posts: PostSummary[]; pagination: PageMeta | null }> => {
  const data = await apiFetch<PageDTO<NewsPageDTO>>(
    "/api/v1/news",
    {
      page,
      page_size: perPage,
      category_id: category,
      keyword: search,
      status: "PUBLISHED",
      ...(sort ? { order_by: sort } : {}),
    },
    { tags: ["news"] },
  );
  // 后端字段缺失时不抛错：列表与总数一律兜底（详情页没有列表页那层 try/catch）。
  const total = data.total ?? 0;
  const posts = (data.list ?? []).map(toPostSummary);
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 1;
  return { posts, pagination: { total, totalPages } };
});

// 仅真实不存在时返回 null；元数据与页面共享同一次详情读取。
export const getPostBySlug = cache(async (slug: string): Promise<PostDetail | null> => {
  try {
    const data = await apiFetch<NewsDetailDTO>(
      `/api/v1/news/${encodeURIComponent(slug)}`,
      undefined,
      { tags: ["news", `news:${slug}`] },
    );
    return toPostDetail(data);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === "A020001")) {
      return null;
    }
    throw error;
  }
});

/** 获取全部已发布文章 slug（用于 SSG 预渲染 generateStaticParams 与 sitemap）。 */
export async function getAllPostSlugs({
  strict = false,
  revalidate = 60,
}: { strict?: boolean; revalidate?: number | false } = {}): Promise<string[]> {
  try {
    const list: NewsPageDTO[] = [];
    let page = 1;
    let total = 0;
    do {
      const data = await apiFetch<PageDTO<NewsPageDTO>>(
        "/api/v1/news",
        {
          page,
          page_size: 50,
          status: "PUBLISHED",
        },
        { revalidate, tags: ["news"] },
      );
      list.push(...(data.list ?? []));
      total = data.total ?? 0;
      page += 1;
      if (!data.list?.length) break;
    } while (list.length < total);
    if (strict && list.length !== total) {
      throw new Error("Incomplete sitemap pagination");
    }
    return list.map((n) => n.slug);
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

/** 全量翻页的页数上限（对齐 scripts/gen-canonical-map.mjs）：后端分页异常时不会无界翻页。 */
const MAX_ADJACENT_PAGES = 200;

/**
 * 获取指定文章的「上一篇 / 下一篇」导航数据。
 * 后端暂无相邻文章接口，这里拉取全量（站点文章极少）后在内存中按发布时间降序定位。
 * 用 React cache() 包裹，与同文件其它读取口径一致（同一次请求内多次调用只打一次后端）。
 */
export const getAdjacentPosts = cache(async (slug: string): Promise<{
  prev: { slug: string; title: string; date: string } | null;
  next: { slug: string; title: string; date: string } | null;
}> => {
  try {
    const list: NewsPageDTO[] = [];
    let page = 1;
    let total = 0;
    do {
      const data = await apiFetch<PageDTO<NewsPageDTO>>(
        "/api/v1/news",
        {
          page,
          page_size: 50,
          status: "PUBLISHED",
        },
        { tags: ["news"] },
      );
      list.push(...(data.list ?? []));
      total = data.total ?? 0;
      page += 1;
      if (!data.list?.length) break;
    } while (list.length < total && page <= MAX_ADJACENT_PAGES);
    const sorted = [...list].sort((a, b) =>
      (b.published_at || "").localeCompare(a.published_at || ""),
    );
    const idx = sorted.findIndex((n) => n.slug === slug);
    if (idx === -1) return { prev: null, next: null };

    const map = (n?: NewsPageDTO) =>
      n
        ? {
            slug: n.slug,
            title: n.title,
            date: formatDate(n.published_at || n.created_time || ""),
          }
        : null;

    return { prev: map(sorted[idx - 1]), next: map(sorted[idx + 1]) };
  } catch {
    return { prev: null, next: null };
  }
});

function toPostSummary(n: NewsPageDTO): PostSummary {
  return {
    id: n.id,
    slug: n.slug,
    title: normalizePublicText(n.title),
    excerpt: normalizePublicText(n.summary),
    featuredImage: toAbsoluteUrl(n.cover_image),
    featuredImageAlt: normalizePublicText(n.title),
    date: formatDate(n.published_at || n.created_time || ""),
    author: n.author || COMPANY.name,
    categories: n.category
      ? [{ id: n.category.id, name: newsCategoryName(n.category.name), slug: n.category.slug }]
      : [],
  };
}

function toPostDetail(n: NewsDetailDTO): PostDetail {
  return {
    id: n.id,
    slug: n.slug,
    title: normalizePublicText(n.title),
    content: n.content_html,
    excerpt: normalizePublicText(n.summary),
    featuredImage: toAbsoluteUrl(n.cover_image),
    featuredImageAlt: normalizePublicText(n.title),
    date: n.published_at || n.created_time || "",
    // API 尚未提供实际更新时间，不能将创建时间冒充修改时间。
    modified: "",
    author: n.author || COMPANY.name,
    authorAvatar: "",
    categories: n.category
      ? [{ id: n.category.id, name: newsCategoryName(n.category.name), slug: n.category.slug }]
      : [],
    tags: [],
  };
}
