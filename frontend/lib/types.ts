/**
 * 完整 TypeScript 类型定义
 * ------------------------------------------------------------------
 * 全站使用的类型声明，按逻辑分组：
 *
 * 1. WordPress 核心类型 —— WP REST API（wp/v2）返回的原始结构
 * 2. WooCommerce 类型 —— WC REST API（wc/v3）及自定义插件字段的原始结构
 * 3. 应用层类型 —— 经转换后供 Next.js 前端组件使用的结构
 * 4. SEO 类型 —— 结构化数据、面包屑、sitemap 条目结构
 *
 * 这些类型是 WordPress 后端与 Next.js 前端之间的契约，
 * 确保 API 调用、页面 props 与组件渲染全程类型安全。
 */

// ============================================================
// WordPress 核心类型（wp/v2 REST API 返回结构）
// ============================================================

/**
 * WordPress 渲染内容对象。
 * 用于 `title`、`content` 等同时支持原始编辑态与渲染后 HTML 输出的字段。
 */
export interface WPContent {
  /** 渲染后的 HTML 字符串 */
  rendered: string;
  /** 内容是否受密码保护 */
  protected: boolean;
}

/**
 * WordPress 摘要对象。
 * 包含文章/页面自动生成或手动填写的摘要。
 */
export interface WPExcerpt {
  /** 渲染后的 HTML 字符串（可能含 `<p>` 标签或为纯文本） */
  rendered: string;
  /** 摘要是否来自受密码保护的文章 */
  protected: boolean;
}

/**
 * 单个 WordPress 媒体附件尺寸变体。
 * 每个已注册图片尺寸都会生成一个 {@link MediaSize} 条目。
 */
export interface MediaSize {
  /** 文件名（相对于 uploads 目录） */
  file: string;
  /** 宽度（像素） */
  width: number;
  /** 高度（像素） */
  height: number;
  /** MIME 类型（如 `image/jpeg`） */
  mime_type: string;
  /** 该尺寸图片的绝对 URL */
  source_url: string;
}

/**
 * 媒体附件所有已注册尺寸变体的集合。
 * 包含 WordPress 核心尺寸及主题/插件额外注册的尺寸。
 */
export interface MediaSizes {
  /** 150x150 缩略图（WP 核心） */
  thumbnail?: MediaSize;
  /** 最大 300px 宽（WP 核心） */
  medium?: MediaSize;
  /** 最大 768px 宽（WP 核心） */
  medium_large?: MediaSize;
  /** 最大 1024px 宽（WP 核心） */
  large?: MediaSize;
  /** 完整/原图尺寸 —— 始终存在 */
  full: MediaSize;
}

/**
 * WordPress 媒体附件（图片、视频、文档等）。
 * 当请求带 `_embed=true` 时，通过 `_embedded['wp:featuredmedia']` 返回。
 */
export interface WPMedia {
  /** 附件文章 ID */
  id: number;
  /** ISO 8601 日期字符串 */
  date: string;
  /** URL 友好的 slug */
  slug: string;
  /** 渲染后的标题（通常为文件名） */
  title: WPContent;
  /** 用于无障碍的 alt 文本 */
  alt_text: string;
  /** 图片说明（可能含 HTML） */
  caption: WPContent;
  /** 较长描述字段 */
  description: WPContent;
  /** 媒体大类（`image`、`video` 等） */
  media_type: string;
  /** 具体 MIME 类型 */
  mime_type: string;
  /** 完整原图的绝对 URL */
  source_url: string;
  /** 尺寸与变体详情（图片时存在） */
  media_details?: { width: number; height: number; sizes: MediaSizes };
}

/**
 * WordPress 文章分类（taxonomy：category，层级型）。
 */
export interface WPCategory {
  /** 术语 ID */
  id: number;
  /** 显示名称（如 "Product News"） */
  name: string;
  /** URL 友好的 slug */
  slug: string;
  /** 分类描述 */
  description: string;
  /** 该分类下的文章数量 */
  count: number;
}

/**
 * WordPress 文章标签（taxonomy：post_tag，非层级型）。
 */
export interface WPTag {
  /** 术语 ID */
  id: number;
  /** 显示名称（如 "OEM Manufacturing"） */
  name: string;
  /** URL 友好的 slug */
  slug: string;
  /** 带该标签的文章数量 */
  count: number;
}

/**
 * WordPress 用户（作者）档案。
 * 当请求带 `_embed=true` 时，通过 `_embedded.author` 返回。
 */
export interface WPUser {
  /** 用户 ID */
  id: number;
  /** 显示名称 */
  name: string;
  /** 作者归档页 URL */
  url: string;
  /** 个人简介 */
  description: string;
  /** 按尺寸索引的头像 URL（如 `"96": "https://..."`） */
  avatar_urls: Record<string, string>;
}

/**
 * WP REST API 返回的原始 WordPress 博客文章。
 * 仅当请求附加 `_embed=true` 时才会包含 `_embedded` 属性。
 */
export interface WPPost {
  /** 文章 ID */
  id: number;
  /** ISO 8601 发布日期（站点时区） */
  date: string;
  /** ISO 8601 发布日期（GMT） */
  date_gmt: string;
  /** ISO 8601 最后修改日期（站点时区） */
  modified: string;
  /** ISO 8601 最后修改日期（GMT） */
  modified_gmt: string;
  /** URL 安全的 slug */
  slug: string;
  /** 文章状态（`publish`、`draft` 等） */
  status: string;
  /** 文章类型（`post`、`page`、`product` 等） */
  type: string;
  /** 渲染后的标题 */
  title: WPContent;
  /** 渲染后的正文内容（HTML） */
  content: WPContent;
  /** 渲染后的摘要 */
  excerpt: WPExcerpt;
  /** 作者用户 ID */
  author: number;
  /** 特色媒体附件 ID */
  featured_media: number;
  /** 分类术语 ID 数组 */
  categories: number[];
  /** 标签术语 ID 数组 */
  tags: number[];
  /** 内嵌的关联数据（仅当 `_embed=true` 时存在） */
  _embedded?: {
    /** 内嵌作者 */
    author?: WPUser[];
    /** 内嵌特色图片 */
    "wp:featuredmedia"?: WPMedia[];
    /** 内嵌分类术语（索引 0 = 分类，索引 1 = 标签） */
    "wp:term"?: (WPCategory[] | WPTag[])[];
  };
}

/**
 * WP REST API 返回的原始 WordPress 页面。
 * 与 {@link WPPost} 类似，但不含分类/标签等分类法字段。
 */
export interface WPPage {
  /** 页面 ID */
  id: number;
  /** ISO 8601 发布日期 */
  date: string;
  /** ISO 8601 最后修改日期 */
  modified: string;
  /** URL 安全的 slug */
  slug: string;
  /** 页面状态（`publish`、`draft` 等） */
  status: string;
  /** 渲染后的标题 */
  title: WPContent;
  /** 渲染后的正文内容（HTML） */
  content: WPContent;
  /** 渲染后的摘要 */
  excerpt: WPExcerpt;
  /** 作者用户 ID */
  author: number;
  /** 特色媒体附件 ID */
  featured_media: number;
  /** 内嵌的关联数据（仅当 `_embed=true` 时存在） */
  _embedded?: {
    /** 内嵌作者 */
    author?: WPUser[];
    /** 内嵌特色图片 */
    "wp:featuredmedia"?: WPMedia[];
  };
}

/**
 * 从 WordPress/WooCommerce 响应头解析出的分页元数据。
 * 由所有 WP/WC REST 端点返回的 `X-WP-TotalPages` 与 `X-WP-Total` 头填充。
 */
export interface WPPagination {
  /** 所有页记录总数 */
  total: number;
  /** 总页数 */
  totalPages: number;
}

// ============================================================
// WooCommerce 类型（wc/v3 REST API + 自定义插件字段）
// ============================================================

/**
 * WooCommerce 产品图片。
 * 表示产品 `images` 或 `gallery` 数组中的单张图片。
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
 * WooCommerce 产品分类（taxonomy：product_cat，层级型）。
 */
export interface WCProductCategory {
  /** 术语 ID */
  id: number;
  /** 显示名称（如 "Action Cameras"） */
  name: string;
  /** URL 友好的 slug */
  slug: string;
}

/**
 * WooCommerce 产品标签（taxonomy：product_tag，非层级型）。
 */
export interface WCProductTag {
  /** 术语 ID */
  id: number;
  /** 显示名称（如 "Waterproof"） */
  name: string;
  /** URL 友好的 slug */
  slug: string;
}

/**
 * WooCommerce 产品属性。
 * 用于传感器类型、分辨率、电池容量等规格说明。
 */
export interface WCProductAttribute {
  /** 属性 ID */
  id: number;
  /** 显示名称（如 "Sensor"） */
  name: string;
  /** 排序位置 */
  position: number;
  /** 是否在产品页可见 */
  visible: boolean;
  /** 是否用于变体 */
  variation: boolean;
  /** 选中的选项值 */
  options: string[];
}

/**
 * WC REST API（wc/v3）返回的原始 WooCommerce 产品。
 * 此为简化类型，仅覆盖前端实际消费到的字段。
 */
export interface WCProduct {
  /** 产品 ID */
  id: number;
  /** 产品名称/标题 */
  name: string;
  /** WordPress 站点上的完整永久链接 */
  permalink: string;
  /** URL 安全的 slug */
  slug: string;
  /** ISO 8601 创建日期 */
  date_created: string;
  /** ISO 8601 最后修改日期 */
  date_modified: string;
  /** 产品类型 */
  type: "simple" | "variable" | "grouped" | "external";
  /** 产品状态（`publish`、`draft` 等） */
  status: string;
  /** 是否标记为推荐产品 */
  featured: boolean;
  /** 完整 HTML 描述 */
  description: string;
  /** 简短纯文本摘要 */
  short_description: string;
  /** 库存单位（SKU） */
  sku: string;
  /** 当前展示价格（用字符串保留精度） */
  price: string;
  /** 常规（非促销）价格 */
  regular_price: string;
  /** 促销价（无促销时为空） */
  sale_price: string;
  /** 渲染后的价格 HTML（如 `<del>$199</del> <ins>$149</ins>`） */
  price_html: string;
  /** 产品当前是否在促销 */
  on_sale: boolean;
  /** 产品是否可购买 */
  purchasable: boolean;
  /** 累计销量 */
  total_sales: number;
  /** 是否为虚拟产品（无需发货） */
  virtual: boolean;
  /** 是否可下载 */
  downloadable: boolean;
  /** 产品图片（第一张为特色图，其余为图库） */
  images: WCProductImage[];
  /** 产品分类 */
  categories: WCProductCategory[];
  /** 产品标签 */
  tags: WCProductTag[];
  /** 产品属性/规格 */
  attributes: WCProductAttribute[];
  /** 变体产品 ID（针对可变产品） */
  variations: number[];
  /** 关联产品 ID */
  related_ids: number[];
  /** 自定义元数据字段 */
  meta_data: { id: number; key: string; value: unknown }[];
  /** 库存可用状态 */
  stock_status: "instock" | "outofstock" | "onbackorder";
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
  /** 完整正文内容（来自 WordPress 的原始 HTML） */
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
 * 静态页（关于、联系等）使用的完整 WordPress 页面表示。
 * 包含渲染所需的 HTML 正文与特色图片。
 */
export interface PageDetail {
  /** 页面 ID */
  id: number;
  /** URL 安全的 slug */
  slug: string;
  /** 页面标题（纯文本） */
  title: string;
  /** 完整正文内容（来自 WordPress 的原始 HTML） */
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
  /** 完整 HTML 描述（来自 WordPress 编辑器） */
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
}

/**
 * 应用层使用的简化产品属性。
 * 由 {@link WCProductAttribute} 展平而来 —— 每个属性映射为单个
 * name/slug/value 元组，而非包含 options 数组。
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
