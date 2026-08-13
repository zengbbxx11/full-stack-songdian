/**
 * @fileoverview 产品域数据访问（对接后端 /api/v1/products 等）
 *
 * 将后端 ProductPageVO / ProductDetailVO 转换为前端组件消费的
 * ProductSummary / ProductDetail 应用层类型。
 *
 * @module api/products
 */

import type {
  ProductSummary,
  ProductDetail,
  WCProductCategory,
  WCProductImage,
  WCAttribute,
} from "@/lib/types";
import {
  apiFetch,
  toAbsoluteUrl,
  type CategoryDTO,
  type ProductPageDTO,
  type ProductDetailDTO,
  type PageDTO,
  type PageMeta,
  type GalleryDTO,
  type AttributeDTO,
} from "./client";

/** 产品列表默认每页数量（与原 WP 前端一致：12）。 */
export const PRODUCTS_PER_PAGE = 12;

/** 获取产品分类列表（用于筛选按钮与面包屑）。 */
export async function getProductCategories(): Promise<WCProductCategory[]> {
  const data = await apiFetch<CategoryDTO[]>(
    "/api/v1/product-categories",
    undefined,
    { tags: ["product-categories"] },
  );
  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

/** 分页获取产品列表，按摘要字段映射为 ProductSummary。 */
export async function getProducts(params?: {
  page?: number;
  perPage?: number;
  category?: number | null;
  search?: string;
  /** 排序方式：映射到后端 order_by 参数（如 "sort_order,-created_time"） */
  sort?: string;
}): Promise<{ products: ProductSummary[]; pagination: PageMeta | null }> {
  const page = params?.page || 1;
  const perPage = params?.perPage || PRODUCTS_PER_PAGE;
  const data = await apiFetch<PageDTO<ProductPageDTO>>(
    "/api/v1/products",
    {
      page,
      page_size: perPage,
      category_id: params?.category ?? undefined,
      keyword: params?.search || undefined,
      status: "PUBLISHED",
      ...(params?.sort ? { order_by: params.sort } : {}),
    },
    { tags: ["products"] },
  );
  const products = data.list.map(toProductSummary);
  const totalPages = data.total > 0 ? Math.ceil(data.total / perPage) : 1;
  return { products, pagination: { total: data.total, totalPages } };
}

/** 按 slug 获取单个产品详情；未找到或出错返回 null。 */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  try {
    const data = await apiFetch<ProductDetailDTO>(
      `/api/v1/products/${encodeURIComponent(slug)}`,
      undefined,
      { tags: ["products", `product:${slug}`] },
    );
    return toProductDetail(data);
  } catch {
    return null;
  }
}

/** 产品 slug 条目（含主分类 slug），用于 SSG 预渲染与 sitemap 生成嵌套 URL。 */
export interface ProductSlugEntry {
  /** 产品 slug */
  slug: string;
  /** 主分类 slug；当前数据均带分类，此字段始终非空 */
  categorySlug: string | null;
}

/** 获取全部已发布产品的 slug + 主分类 slug（用于 SSG / sitemap 生成 /products/{category}/{slug}）。 */
export async function getAllProductSlugEntries(): Promise<ProductSlugEntry[]> {
  try {
    const list: ProductPageDTO[] = [];
    let page = 1;
    let total = 0;
    do {
      const data = await apiFetch<PageDTO<ProductPageDTO>>(
        "/api/v1/products",
        {
          page,
          page_size: 50,
          status: "PUBLISHED",
        },
        { tags: ["products"] },
      );
      list.push(...data.list);
      total = data.total;
      page += 1;
      if (data.list.length === 0) break;
    } while (list.length < total);
    return list.map((p) => ({ slug: p.slug, categorySlug: p.category?.slug ?? null }));
  } catch {
    return [];
  }
}

function toProductSummary(p: ProductPageDTO): ProductSummary {
  return {
    id: p.id,
    slug: p.slug,
    name: p.title,
    shortDescription: p.summary,
    price: p.price ?? "",
    regularPrice: p.price ?? "",
    salePrice: "",
    onSale: false,
    featured: false,
    image: toAbsoluteUrl(p.cover_image),
    imageAlt: p.title,
    categories: p.category
      ? [{ id: p.category.id, name: p.category.name, slug: p.category.slug }]
      : [],
    // 从后端 DTO 读取标签字符串数组；DB 为 NULL 时兜底为空数组
    tags: p.tags || [],
    stockStatus: p.stock_status,
  };
}

function toProductDetail(p: ProductDetailDTO): ProductDetail {
  const galleries: WCProductImage[] = p.galleries.map((g: GalleryDTO) => ({
    id: g.id,
    date_created: "",
    src: toAbsoluteUrl(g.image_url) ?? "",
    name: g.alt || "",
    alt: g.alt || "",
  }));
  const cover = toAbsoluteUrl(p.cover_image);
  const images: WCProductImage[] = cover
    ? [{ id: -1, date_created: "", src: cover, name: p.title, alt: p.title }, ...galleries]
    : galleries;
  const attributes: WCAttribute[] = p.attributes.map((a: AttributeDTO) => ({
    name: a.name,
    slug: a.slug,
    value: a.value,
  }));
  const price = p.price ?? "";
  return {
    id: p.id,
    slug: p.slug,
    name: p.title,
    description: p.content_html,
    shortDescription: p.summary,
    price,
    regularPrice: price,
    salePrice: "",
    priceHtml: price ? price : "",
    onSale: false,
    sku: p.sku ?? "",
    images,
    gallery: galleries,
    categories: p.category
      ? [{ id: p.category.id, name: p.category.name, slug: p.category.slug }]
      : [],
    // 从后端 DTO 读取标签字符串数组；DB 为 NULL 时兜底为空数组
    tags: p.tags || [],
    attributes,
    relatedIds: [],
    stockStatus: p.stock_status,
    dateModified: p.updated_time ?? p.created_time ?? "",
    // SEO 字段透传（后端 NULL → null，前端 generateMetadata 做回退）
    seoTitle: p.seo_title ?? null,
    seoDescription: p.seo_description ?? null,
  };
}
