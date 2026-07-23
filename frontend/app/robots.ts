/*
 * 文件：app/robots.ts（爬虫规则 / Robots）
 * 职责：生成 robots.txt，允许所有搜索引擎抓取全站，并指向 sitemap.xml。
 * 数据来源：无 —— 仅依赖 NEXT_PUBLIC_SITE_URL 环境变量拼接 sitemap 地址。
 * 渲染方式：Next.js Metadata Route，服务端生成（非 SSG/ISR）。
 * 是否含 client 组件：否。
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
