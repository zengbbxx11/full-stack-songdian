/*
 * 文件：app/sitemap.ts（站点地图 / Sitemap）
 * 职责：生成 sitemap.xml，包含静态页面、动态产品页与动态文章页的 URL 及更新频率。
 * 数据来源：
 *   - getAllProductSlugEntries() → 产品 slug + 主分类 slug（动态 /products/[category]/[slug]）
 *   - getAllPostSlugs()          → 文章 slug（动态 /news/[slug]）
 * 渲染方式：运行时 Metadata Route；后端失败不返回残缺的成功结果。
 * 是否含 client 组件：否。
 */

import type { MetadataRoute } from "next";
import { getAllPostSlugs } from "@/lib/api/news";
import { getAllProductSlugEntries } from "@/lib/api/products";

// 镜像构建不依赖运行时 API；请求时必须取得完整动态 URL。
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const [entries, postSlugs] = await Promise.all([
    // Sitemap URLs must reflect newly published records immediately; regular page data uses ISR.
    getAllProductSlugEntries({ strict: true, revalidate: false }),
    getAllPostSlugs({ strict: true, revalidate: false }),
  ]);

  // 静态页面
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "daily", priority: 1.0 },
    { url: `${siteUrl}/about`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/news`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/solutions`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/solutions/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/privacy-policy`, changeFrequency: "monthly", priority: 0.3 },
  ];

  // 动态产品路由（规范嵌套地址 /products/{category}/{slug}）
  const productRoutes: MetadataRoute.Sitemap = entries
      .filter((e) => e.categorySlug)
      .map((e) => ({
        url: `${siteUrl}/products/${e.categorySlug}/${e.slug}`,
        lastModified: e.lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  // 新闻 API 未提供实际更新时间，省略可选 lastModified。
  const postRoutes: MetadataRoute.Sitemap = postSlugs.map((slug) => ({
      url: `${siteUrl}/news/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [...staticRoutes, ...productRoutes, ...postRoutes];
}
