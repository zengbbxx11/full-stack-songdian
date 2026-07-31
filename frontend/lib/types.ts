/**
 * 完整 TypeScript 类型定义
 * ------------------------------------------------------------------
 * 全站使用的类型声明，按逻辑分组：
 *
 * 1. 产品契约类型 —— 产品/分类/图片的映射结构（WC 前缀为历史命名，现对接 FastAPI）
 * 2. 应用层类型 —— 经转换后供 Next.js 前端组件消费的结构
 * 3. SEO 类型 —— 结构化数据、面包屑、sitemap 条目结构
 *
 * 历史说明：本站早期以 WordPress/WooCommerce 为数据源，曾在此定义大量
 * WP/WC REST 原始结构类型。迁移至 FastAPI 后端后，这些原始契约类型已删除，
 * 仅保留经转换后的应用层类型；分类/图片契约类型（WCProductCategory /
 * WCProductImage / WCAttribute）名称保留历史前缀，实际由 FastAPI 提供。
 */

// ============================================================
// 产品契约类型（原 WooCommerce 映射，现对接 FastAPI 后端）
// ============================================================

/**
 * 产品图片。
 * 表示产品 `images` 或 `gallery` 数组中的单张图片（由 FastAPI GalleryVO 映射）。
 */
export interface WCProductImage {
  /** 图片附件 ID */
  id: number;
  /** ISO 8601 创建日期 */
  date_created: string;
  /** 绝对源 URL */
  src: string;
  /** 图片名称/标题 */
  name: string;
  /** 用于无障碍的 alt 文本 */
  alt: string;
}

/**
 * 产品分类。
 * 现由 FastAPI ProductCategoryVO 映射。
 */
export interface WCProductCategory {
  /** 术语 ID */
  id: number;
  /** 显示名称（如 "Action Cameras"） */
  name: string;
  /** URL 友好的 slug */
  slug: string;
}

// ============================================================
// 应用层类型（经转换后供 Next.js 前端消费）
// ============================================================

/**
 * 列表视图（博客首页、分类页）使用的轻量文章表示。
 * 仅包含文章卡片/预览所需的字段。
 */
export interface PostSummary {
  /** 文章 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 文章标题（纯文本） */
  title: string;
  /** 简短摘要（已去除 HTML） */
  excerpt: string;
  /** 特色图片 URL（可为 null） */
  featuredImage: string | null;
  /** 特色图片 alt 文本 */
  featuredImageAlt: string;
  /** 格式化后的发布日期（如 "March 15, 2025"） */
  date: string;
  /** 作者显示名称 */
  author: string;
  /** 关联的分类 */
  categories: { id: number; name: string; slug: string }[];
}

/**
 * 单篇文章页使用的完整文章表示。
 * 包含完整 HTML 正文及详情页与 SEO 所需的全部元数据。
 */
export interface PostDetail {
  /** 文章 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 文章标题（纯文本） */
  title: string;
  /** 完整正文内容（纯文本/HTML 字符串） */
  content: string;
  /** 简短摘要（已去除 HTML） */
  excerpt: string;
  /** 特色图片 URL（可为 null） */
  featuredImage: string | null;
  /** 特色图片 alt 文本 */
  featuredImageAlt: string;
  /** 格式化后的发布日期 */
  date: string;
  /** ISO 8601 最后修改日期字符串 */
  modified: string;
  /** 作者显示名称 */
  author: string;
  /** 作者头像 URL（96px） */
  authorAvatar: string;
  /** 关联的分类 */
  categories: { id: number; name: string; slug: string }[];
  /** 关联的标签 */
  tags: { id: number; name: string; slug: string }[];
}

/**
 * 静态页（关于、联系等）使用的完整页面表示。
 * 包含渲染所需的 HTML 正文与特色图片。
 */
export interface PageDetail {
  /** 页面 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 页面标题（纯文本） */
  title: string;
  /** 完整正文内容（纯文本/HTML 字符串） */
  content: string;
  /** 简短摘要（已去除 HTML） */
  excerpt: string;
  /** 特色图片 URL（可为 null） */
  featuredImage: string | null;
  /** ISO 8601 最后修改日期字符串 */
  modified: string;
}

/**
 * 产品网格/列表视图使用的轻量产品表示。
 * 包含产品卡片（图片、名称、价格等）所需字段。
 */
export interface ProductSummary {
  /** 产品 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 产品名称 */
  name: string;
  /** 简短描述（已去除 HTML） */
  shortDescription: string;
  /** 当前展示价格（用字符串保留精度） */
  price: string;
  /** 常规（非促销）价格 */
  regularPrice: string;
  /** 促销价（无促销时为空） */
  salePrice: string;
  /** 产品是否在促销 */
  onSale: boolean;
  /** 是否为推荐产品 */
  featured: boolean;
  /** 主产品图片 URL（可为 null） */
  image: string | null;
  /** 产品图片 alt 文本 */
  imageAlt: string;
  /** 产品分类 */
  categories: WCProductCategory[];
  /** 产品标签 —— 标签名称字符串数组（与后端契约对齐，存名称而非 {id,name} 对象） */
  tags: string[];
  /** 库存可用状态（`instock`、`outofstock` 等） */
  stockStatus: string;
}

/**
 * 单产品详情页使用的完整产品表示。
 * 包含完整描述 HTML、图库图片、属性与关联产品。
 */
export interface ProductDetail {
  /** 产品 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 产品名称 */
  name: string;
  /** 完整 HTML 描述 */
  description: string;
  /** 简短纯文本描述 */
  shortDescription: string;
  /** 当前展示价格 */
  price: string;
  /** 常规价格 */
  regularPrice: string;
  /** 促销价 */
  salePrice: string;
  /** 渲染后的价格 HTML（含促销删除线等） */
  priceHtml: string;
  /** 产品是否在促销 */
  onSale: boolean;
  /** 库存单位（SKU） */
  sku: string;
  /** 全部产品图片（特色图 + 图库合并） */
  images: WCProductImage[];
  /** 图库图片（不含特色图） */
  gallery: WCProductImage[];
  /** 产品分类 */
  categories: WCProductCategory[];
  /** 产品标签 —— 标签名称字符串数组（与后端契约对齐，存名称而非 {id,name} 对象） */
  tags: string[];
  /** 产品规格/属性 */
  attributes: WCAttribute[];
  /** 关联产品 ID */
  relatedIds: number[];
  /** 库存可用状态 */
  stockStatus: string;
  /** ISO 8601 最后修改日期字符串 */
  dateModified: string;
  /** SEO 页面标题（覆盖 name，空则回退 name） */
  seoTitle: string | null;
  /** SEO Meta 描述（覆盖 shortDescription，空则回退截取） */
  seoDescription: string | null;
}

/**
 * 应用层使用的简化产品属性。
 * 由产品属性展平而来 —— 每个属性映射为单个 name/slug/value 元组，
 * 而非包含 options 数组。
 */
export interface WCAttribute {
  /** 属性名称（如 "Sensor"） */
  name: string;
  /** URL 安全的 slug */
  slug: string;
  /** 属性值（如 "1/2.3-inch CMOS"） */
  value: string;
}

// ============================================================
// SEO 类型
// ============================================================

/**
 * 用于 UI 渲染与 Schema.org BreadcrumbList 的单个面包屑项。
 * 路径中最后一项通常省略 `href`，因其代表当前页。
 */
export interface BreadcrumbItem {
  /** 显示标签 */
  label: string;
  /** 目标 URL（当前页省略） */
  href?: string;
}

/**
 * 通用 Schema.org JSON-LD 结构化数据对象。
 * `@context` 与 `@type` 为必填字段；其余属性通过索引签名支持
 * 所有 Schema.org 类型。
 */
export interface StructuredData {
  /** JSON-LD 上下文（恒为 `"https://schema.org"`） */
  "@context": string;
  /** Schema.org 类型（如 `"Article"`、`"Product"`、`"BreadcrumbList"`） */
  "@type": string;
  /** 其余任意 Schema.org 属性 */
  [key: string]: unknown;
}

// ============================================================
// Sitemap 类型
// ============================================================

/**
 * XML sitemap 中的单个条目。
 * 遵循 sitemaps.org 协议，含可选的更新频率与优先级。
 */
export interface SitemapEntry {
  /** 页面绝对 URL */
  url: string;
  /** 最后修改日期（ISO 字符串或 Date 对象） */
  lastModified?: string | Date;
  /** 页面预计的变更频率 */
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  /** 站内相对其他 URL 的优先级（0.0 – 1.0） */
  priority?: number;
}
