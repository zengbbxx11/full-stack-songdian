/**
 * @fileoverview SEO 工具模块
 *
 * 提供 JSON-LD 结构化数据生成器（Schema.org）、语义面包屑构建器
 * 以及用于填充页面 `<head>` 的 SEO 元数据辅助函数。
 * 所有 schema 均引用环境配置中的实时站点 URL。
 *
 * 支持的 schema 类型：
 * - Organization（组织）
 * - WebSite（含站点链接搜索框）
 * - BreadcrumbList（面包屑列表）
 * - Article（博客文章）
 * - Product（WooCommerce 产品）
 * - FAQPage（常见问题页面）
 * - LocalBusiness / Manufacturer（本地商家/制造商）
 */

import type { BreadcrumbItem, StructuredData } from "@/lib/types";
import { COMPANY } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";

/**
 * 安全地序列化 JSON-LD。
 *
 * `JSON.stringify` 不会转义 `<` / `>`，若字段值含 `</script>` 会直接截断脚本块并可能
 * 注入脚本（存储型 XSS，security-audit F-01）。将 `<` 转义为 `\u003c` 即可彻底杜绝
 * `</script>` 逃逸，浏览器解析 JSON 时 `\u003c` 仍还原为 `<`。
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** 规范站点 URL，在构建/运行时从环境中解析 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// ============================================================
// 面包屑生成器
// ============================================================

/**
 * 生成语义面包屑路径，用于 UI 渲染与 Schema.org
 * BreadcrumbList 结构化数据。"首页"面包屑始终自动前置。
 *
 * @example
 * ```ts
 * generateBreadcrumbs([
 *   { label: "博客", href: "/blog" },
 *   { label: "我的文章" },
 * ]);
 * // => [{ label: "首页", href: "/" }, { label: "博客", href: "/blog" }, { label: "我的文章" }]
 * ```
 *
 * @param items - 面包屑分段数组；最后一项通常不含 `href`
 * @returns 含前置"首页"的 {@link BreadcrumbItem} 数组
 */
export function generateBreadcrumbs(
  items: { label: string; href?: string }[]
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    ...items,
  ];
}

// ============================================================
// JSON-LD 结构化数据生成器
// ============================================================

/**
 * 生成 Organization（组织）Schema.org 结构化数据对象。
 * 用于首页与全局站点元数据中标识公司实体。
 *
 * @returns 符合 https://schema.org/Organization 的 {@link StructuredData} 对象
 */
export function organizationSchema(): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: COMPANY.name,
    url: SITE_URL,
    description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "",
    logo: MEDIA.logo,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: COMPANY.contact.email,
      telephone: COMPANY.contact.phone,
    },
    sameAs: [
      COMPANY.social.linkedin,
      COMPANY.social.youtube,
      COMPANY.social.alibaba,
    ],
  };
}

/**
 * 生成带站点链接搜索框的 WebSite Schema.org 结构化数据对象。
 * 为博客搜索功能启用 Google 的站点链接搜索框（sitelinks searchbox）。
 *
 * @returns 符合 https://schema.org/WebSite 的 {@link StructuredData} 对象
 */
export function webSiteSchema(): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: COMPANY.name,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/news?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * 生成 BreadcrumbList（面包屑列表）Schema.org 结构化数据对象。
 * 每个面包屑项映射为带位置编号的 ListItem。
 *
 * @param items - 面包屑项（通常来自 {@link generateBreadcrumbs}）
 * @returns 符合 https://schema.org/BreadcrumbList 的 {@link StructuredData} 对象
 */
export function breadcrumbSchema(items: BreadcrumbItem[]): StructuredData {
  const siteUrl = SITE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${item.href}` : undefined,
    })),
  };
}

/**
 * 为博客文章生成 Article Schema.org 结构化数据对象。
 *
 * @param params - 文章元数据
 * @param params.title         - 文章标题
 * @param params.description   - SEO meta 描述 / 摘要
 * @param params.image         - 特色图片绝对 URL（可为 null）
 * @param params.datePublished - ISO 8601 发布日期
 * @param params.dateModified  - ISO 8601 最后修改日期
 * @param params.author        - 作者显示名称
 * @param params.url           - 相对于站点根目录的文章路径（如 `/blog/my-post`）
 * @returns 符合 https://schema.org/Article 的 {@link StructuredData} 对象
 */
export function articleSchema(params: {
  title: string;
  description: string;
  image?: string | null;
  datePublished: string;
  dateModified: string;
  author: string;
  url: string;
}): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.title,
    description: params.description,
    image: params.image || undefined,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    author: {
      "@type": "Person",
      name: params.author,
    },
    publisher: {
      "@type": "Organization",
      name: COMPANY.name,
    },
    url: `${SITE_URL}${params.url}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}${params.url}`,
    },
  };
}

/**
 * 为 WooCommerce 产品页生成 Product Schema.org 结构化数据对象。
 * offer 使用 `businessFunction: ProvideService` 以体现 B2B 询盘模式
 *（价格通过报价获取，而非直接下单结算）。
 *
 * @param params - 产品元数据
 * @param params.name        - 产品显示名称
 * @param params.description - 产品描述（纯文本或 HTML）
 * @param params.image       - 主产品图片绝对 URL（可为 null）
 * @param params.sku         - 产品 SKU（可为 null）
 * @param params.url         - 相对于站点根目录的产品路径（如 `/products/my-camera`）
 * @returns 符合 https://schema.org/Product 的 {@link StructuredData} 对象
 */
export function productSchema(params: {
  name: string;
  description: string;
  image?: string | null;
  sku?: string;
  url: string;
}): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: params.name,
    description: params.description,
    image: params.image || undefined,
    sku: params.sku || undefined,
    brand: {
      "@type": "Brand",
      name: COMPANY.name,
    },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      priceCurrency: "USD",
      url: `${SITE_URL}${params.url}`,
      // 通过询盘获取价格 — B2B 典型模式
      businessFunction: "https://purl.org/goodrelations/v1#ProvideService",
    },
  };
}

/**
 * 生成 FAQPage Schema.org 结构化数据对象。
 * 每个 FAQ 条目变为一个带 acceptedAnswer 的 Question。
 *
 * @param faqs - 问题/答案对数组
 * @returns 符合 https://schema.org/FAQPage 的 {@link StructuredData} 对象
 */
export function faqSchema(faqs: { question: string; answer: string }[]): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/**
 * 生成 Manufacturer（本地商家）Schema.org 结构化数据对象。
 * 为本地 SEO 提供公司的实体地址与联系详情。
 *
 * @returns 符合 https://schema.org/Manufacturer 的 {@link StructuredData} 对象
 */
export function localBusinessSchema(): StructuredData {
  return {
    "@context": "https://schema.org",
    "@type": "Manufacturer",
    name: COMPANY.name,
    url: SITE_URL,
    description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "",
    telephone: COMPANY.contact.phone,
    email: COMPANY.contact.email,
    address: {
      "@type": "PostalAddress",
      addressCountry: "CN",
      addressRegion: "Guangdong",
      addressLocality: "Foshan",
      streetAddress: "Room 801, Building 17, Tongde Intelligent Manufacturing Park, No. 9 Guizhou Avenue East, Shangjiashi Community, Ronggui Subdistrict, Shunde District, Foshan, Guangdong",
    },
  };
}
