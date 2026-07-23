/*
 * 文件：app/sitemap.ts（站点地图 / Sitemap）
 * 职责：生成 sitemap.xml，包含静态页面、动态产品页与动态文章页的 URL 及更新频率。
 * 数据来源（WP REST API）：
 *   - getAllProductSlugs() → 产品 slug（动态 /products/[slug]）
 *   - getAllPostSlugs()    → 文章 slug（动态 /news/[slug]）
 * 渲染方式：Next.js Metadata Route，服务端异步生成（WP 不可用时静默跳过动态部分）。
 * 是否含 client 组件：否。
 */

import type { MetadataRoute } from "next";
import { getAllPostSlugs } from "@/lib/api/news";
import { getAllProductSlugs } from "@/lib/api/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // 静态页面
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/about`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/products`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/news`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/solutions`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/solutions/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/privacy-policy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];

  // 动态产品路由（从 WooCommerce 获取）
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const productSlugs = await getAllProductSlugs();
    productRoutes = productSlugs.map((slug) => ({
      url: `${siteUrl}/products/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // WooCommerce 不可用时静默跳过
  }

  // 动态文章路由（从 WordPress 获取）
  let postRoutes: MetadataRoute.Sitemap = [];
  try {
    const postSlugs = await getAllPostSlugs();
    postRoutes = postSlugs.map((slug) => ({
      url: `${siteUrl}/news/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // WordPress 不可用时静默跳过
  }

  return [...staticRoutes, ...productRoutes, ...postRoutes];
}
