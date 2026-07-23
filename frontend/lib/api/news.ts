/**
 * @fileoverview 新闻域数据访问（对接后端 /api/v1/news 等）
 *
 * 将后端 NewsPageVO / NewsDetailVO 转换为前端组件消费的
 * PostSummary / PostDetail 应用层类型。
 *
 * @module api/news
 */

import type { PostSummary, PostDetail, WCProductCategory } from "@/lib/types";
import {
  apiFetch,
  toAbsoluteUrl,
  formatDate,
  type CategoryDTO,
  type NewsPageDTO,
  type NewsDetailDTO,
  type PageDTO,
  type PageMeta,
} from "./client";

/** 新闻列表默认每页数量（与原 WP 前端一致：9）。 */
export const NEWS_PER_PAGE = 9;

/** 获取新闻分类列表。 */
export async function getNewsCategories(): Promise<WCProductCategory[]> {
  const data = await apiFetch<CategoryDTO[]>("/api/v1/news-categories");
  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

/** 分页获取新闻列表，按摘要字段映射为 PostSummary。 */
export async function getPosts(params?: {
  page?: number;
  perPage?: number;
  categoryId?: number | null;
  search?: string;
  /** 排序方式：映射到后端 order_by 参数（如 "sort_order,-created_time"） */
  sort?: string;
}): Promise<{ posts: PostSummary[]; pagination: PageMeta | null }> {
  const page = params?.page || 1;
  const perPage = params?.perPage || NEWS_PER_PAGE;
  const data = await apiFetch<PageDTO<NewsPageDTO>>("/api/v1/news", {
    page,
    page_size: perPage,
    category_id: params?.categoryId ?? undefined,
    keyword: params?.search || undefined,
    status: "PUBLISHED",
    ...(params?.sort ? { order_by: params.sort } : {}),
  });
  const posts = data.list.map(toPostSummary);
  const totalPages = data.total > 0 ? Math.ceil(data.total / perPage) : 1;
  return { posts, pagination: { total: data.total, totalPages } };
}

/** 按 slug 获取单篇文章详情；未找到或出错返回 null。 */
export async function getPostBySlug(slug: string): Promise<PostDetail | null> {
  try {
    const data = await apiFetch<NewsDetailDTO>(`/api/v1/news/${encodeURIComponent(slug)}`);
    return toPostDetail(data);
  } catch {
    return null;
  }
}

/** 获取全部已发布文章 slug（用于 SSG 预渲染 generateStaticParams 与 sitemap）。 */
export async function getAllPostSlugs(): Promise<string[]> {
  try {
    const data = await apiFetch<PageDTO<NewsPageDTO>>("/api/v1/news", {
      page: 1,
      page_size: 100,
      status: "PUBLISHED",
    });
    return data.list.map((n) => n.slug);
  } catch {
    return [];
  }
}

/**
 * 获取指定文章的「上一篇 / 下一篇」导航数据。
 * 后端暂无相邻文章接口，这里拉取全量（站点文章极少）后在内存中按发布时间降序定位。
 */
export async function getAdjacentPosts(slug: string): Promise<{
  prev: { slug: string; title: string; date: string } | null;
  next: { slug: string; title: string; date: string } | null;
}> {
  try {
    const data = await apiFetch<PageDTO<NewsPageDTO>>("/api/v1/news", {
      page: 1,
      page_size: 100,
      status: "PUBLISHED",
    });
    const sorted = [...data.list].sort((a, b) =>
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
}

function toPostSummary(n: NewsPageDTO): PostSummary {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    excerpt: n.summary,
    featuredImage: toAbsoluteUrl(n.cover_image),
    featuredImageAlt: n.title,
    date: formatDate(n.published_at || n.created_time || ""),
    author: n.author || "Admin",
    categories: n.category
      ? [{ id: n.category.id, name: n.category.name, slug: n.category.slug }]
      : [],
  };
}

function toPostDetail(n: NewsDetailDTO): PostDetail {
  return {
    id: n.id,
    slug: n.slug,
    title: n.title,
    content: n.content_html,
    excerpt: n.summary,
    featuredImage: toAbsoluteUrl(n.cover_image),
    featuredImageAlt: n.title,
    date: formatDate(n.published_at || n.created_time || ""),
    modified: n.created_time || n.published_at || "",
    author: n.author || "Admin",
    authorAvatar: "",
    categories: n.category
      ? [{ id: n.category.id, name: n.category.name, slug: n.category.slug }]
      : [],
    tags: [],
  };
}
