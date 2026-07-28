/**
 * @fileoverview 站点全局配置模块
 *
 * 导航链接、页脚链接组以及共享常量的中央配置入口。
 * 本模块作为布局组件（Header、Footer）使用的单一数据源，
 * 并与 {@link content-data.ts} 保持同步，共享产品分类与公司信息。
 */

import { COMPANY, PRODUCT_CATEGORIES } from "@/lib/content-data";

/**
 * 从 content-data 重新导出共享的 COMPANY 常量。
 * 集中在此处，使布局组件只需从 `site-config` 导入，
 * 而无须了解内部模块结构。
 */
export { COMPANY };

/**
 * 站点头部渲染的主要导航链接。
 * 顺序很重要 —— 决定了桌面端导航栏从左到右的排列。
 */
export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Solutions", href: "/solutions" },
  { label: "News", href: "/news" },
  { label: "About", href: "/about" },
] as const;

/**
 * 页脚社交链接（单一数据源）。
 * 此前 Footer 组件内联硬编码了这套列表，导致与内容层 COMPANY.social（SEO sameAs）
 * 双份维护、YouTube 账号还不一致。现统一收口到本配置模块，
 * 图标文件位于 public/MediaIcon/（仅 Facebook/YouTube/Instagram/TikTok 四种）。
 * 未开通的平台 url 置 null，渲染为非交互的「coming soon」占位。
 */
export const SOCIAL_LINKS = [
  {
    name: "Facebook",
    icon: "/MediaIcon/facebook.png",
    url: "https://www.facebook.com/people/Songdian-Camera/61580702439375/",
  },
  {
    name: "YouTube",
    icon: "/MediaIcon/youtube.png",
    url: "https://www.youtube.com/@SongDianCam",
  },
  { name: "Instagram", icon: "/MediaIcon/instagram.png", url: null },
  { name: "TikTok", icon: "/MediaIcon/tik-tok.png", url: null },
] as const;

/**
 * 按列组织的页脚链接组。
 * 每组含一个用于列标题的语义键，以及一组链接对象（label + href）。
 *
 * `products` 列由 {@link PRODUCT_CATEGORIES} 的前 4 项自动填充，
 * 并追加一个"查看全部产品"链接。
 */
export const FOOTER_LINKS = {
  /** 产品分类链接 —— 派生自 {@link PRODUCT_CATEGORIES}，点击跳转到对应分类筛选页 */
  products: [
    ...PRODUCT_CATEGORIES.map((c) => ({
      label: c.name,
      href: `/products?category=${c.slug}`,
    })),
  ],
  /** 服务相关链接 */
  services: [
    { label: "OEM / ODM", href: "/solutions" },
    { label: "FAQ", href: "/solutions/faq" },
  ],
  /** 公司信息链接 */
  company: [
    { label: "About Us", href: "/about" },
    { label: "News", href: "/news" },
    { label: "Contact", href: "/contact" },
  ],
  /** 客户支持链接 */
  support: [
    { label: "FAQ", href: "/solutions/faq" },
    { label: "Request Quote", href: "/contact" },
    { label: "Privacy Policy", href: "/privacy-policy" },
  ],
} as const;
