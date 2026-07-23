/*
 * 文件：app/layout.tsx（根布局 / Root Layout）
 * 职责：全站根布局，包裹所有页面。负责字体加载（Geist Sans/Mono）、
 *       全局 SEO 元信息与 JSON-LD（Organization + WebSite）、
 *       以及持久化 UI 外壳（Header → main → Footer → FloatingInquiry）。
 * 数据来源：本地常量与工具 —— COMPANY（@/lib/content-data）、MEDIA（@/lib/media）、
 *           organizationSchema()/webSiteSchema()（@/lib/seo）；不直接请求 WP REST API。
 * 渲染方式：服务端组件（Root Layout，随请求渲染，非独立 SSG/ISR）。
 * 是否含 client 组件：是 —— Header、Footer、FloatingInquiry 内部包含交互/客户端组件。
 */

/**
 * RootLayout — Songdian Technology B2B Website
 * ------------------------------------------------------------------
 * Next.js App Router root layout that wraps every page on the site.
 * Provides:
 *   - Font loading (Geist Sans + Geist Mono from next/font)
 *   - Global Metadata & Open Graph for SEO (search engines / social sharing)
 *   - Twitter Card metadata for social previews on X / Twitter
 *   - JSON-LD structured data (Organization + WebSite schemas)
 *   - Persistent UI shell: Header, main content area, Footer
 *   - FloatingInquiry quick-contact widget visible on all pages
 *   - Google Analytics scaffolding (commented-out GA4 snippet)
 *   - Robots directives allowing full indexing / crawling
 *   - Canonical URL via `alternates` for duplicate-content avoidance
 *   - Tailwind CSS v4 + custom theme variables via globals.css
 *
 * Dependencies:
 *   - lib/content-data.ts        → COMPANY constants (name, tagline, description)
 *   - lib/seo.ts                 → organizationSchema(), webSiteSchema()
 *   - components/Header.tsx       → site-wide header + navigation
 *   - components/Footer.tsx       → site-wide footer
 *   - components/FloatingInquiry  → floating inquiry button / form
 */

import type { Metadata, Viewport } from "next";
import { initSuperMeta } from "next-super-meta";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingInquiry from "@/components/FloatingInquiry";
import NavigationProgress from "@/components/NavigationProgress";
import { COMPANY } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";
import { organizationSchema, webSiteSchema } from "@/lib/seo";
import "./globals.css";

// 初始化 next-super-meta 全局配置
initSuperMeta({
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  defaultImage: MEDIA.ogImage,
});

// ------------------------------------------------------------------
// Font configuration — self-hosted via next/font (no external requests)
// ------------------------------------------------------------------

/** Geist Sans — primary body / heading font, loaded with Latin subset */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Geist Mono — monospace font for code / technical content */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// ------------------------------------------------------------------
// Site URL — used for canonical links, OG images, and JSON-LD @id
// ------------------------------------------------------------------

/** Canonical base URL of the site; override via NEXT_PUBLIC_SITE_URL env var */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * Global Metadata object exported for every page.
 * Child pages can extend or override individual fields via their own `metadata` export.
 * Includes Open Graph, Twitter Card, robots, and alternates for SEO best practices.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  // Page title: "Songdian Technology — OEM / ODM Digital Camera Manufacturer"
  title: {
    default: `${COMPANY.name} — ${COMPANY.tagline}`,
    template: `%s | ${COMPANY.name}`,
  },
  description: COMPANY.description,

  // SEO keywords targeting B2B camera manufacturing buyers
  keywords: [
    "digital camera manufacturer",
    "OEM camera factory",
    "ODM camera supplier",
    "Songdian Technology",
    "松典相机",
    "compact digital camera OEM",
    "mirrorless camera factory",
    "action camera manufacturer",
    "kids camera supplier",
    "video camera OEM",
    "custom camera development",
    "China camera factory",
    "B2B camera manufacturing",
    "private label cameras",
  ],

  authors: [{ name: COMPANY.fullName }],
  creator: COMPANY.name,
  publisher: COMPANY.name,

  // Disable automatic phone/email/address detection (prevents iOS/Android from linking text)
  formatDetection: { email: false, telephone: false, address: false },

  // Open Graph — used by Facebook, LinkedIn, Discord, etc.
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: COMPANY.name,
    title: `${COMPANY.name} — ${COMPANY.tagline}`,
    description: COMPANY.description,
    images: [{ url: MEDIA.ogImage, width: 1200, height: 630 }],
  },

  // Twitter Card — used by X / Twitter for link previews
  twitter: {
    card: "summary_large_image",
    title: `${COMPANY.name} — ${COMPANY.tagline}`,
    description: COMPANY.description,
    images: [{ url: MEDIA.ogImage, width: 1200, height: 630 }],
  },

  // Robots: allow all indexing and crawling by both generic + Google crawlers
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Canonical URL to prevent duplicate-content SEO penalties
  alternates: {
    canonical: SITE_URL,
  },

  // Favicon / 站点图标 — 使用品牌 Logo SVG
  icons: {
    icon: "/Favicon/songdiantechSite.svg",
    shortcut: "/Favicon/songdiantechSite.svg",
  },

  // Site verification — Google Search Console（上线前填入实际验证码）
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined,
  },
};

/**
 * Viewport configuration — 独立于 Metadata 导出（Next.js 16 推荐）
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#171A20" },
  ],
};

/**
 * RootLayout — the outermost React Server Component.
 * Renders <html>, <head> (with JSON-LD), <body>, and the persistent shell
 * (Header → main → Footer → FloatingInquiry) that wraps every child page.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate JSON-LD structured data for Google rich results
  const orgSchema = organizationSchema();
  const siteSchema = webSiteSchema();

  return (
    // ------------------------------------------------------------------
    // <html> 标签：设置 lang="en" 以利无障碍与 SEO，挂载字体 CSS 变量，
    // 并启用 Tailwind 的抗锯齿平滑渲染
    // ------------------------------------------------------------------
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* JSON-LD 结构化数据 —— 注入供 Google 富媒体结果使用 */}
        {/* Organization 架构：名称、Logo、URL、sameAs 社交档案 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        {/* WebSite 架构：启用 Google 搜索结果中的站内搜索框 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
        {/*
          Google Analytics / GTM
          Currently handled by WordPress Site Kit plugin.
          To enable direct GA4 tracking, uncomment the Script blocks below
          and replace the measurement ID with your own.
        */}
        {/* next-super-meta 自动注入 SEO 元标签 */}
      </head>
      {/* Body：纵向 flex 列布局，将页脚推到底部；白底深字 */}
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        {/* 顶部路由切换进度条 — 点击链接瞬间触发 */}
        <NavigationProgress />

        {/* 站点级导航页头 */}
        <Header />

        {/*
          主内容区：
          - flex-1 将页脚推至底部署短页面
          - pt-14 匹配 Tesla 风格固定页头高度（h-14 = 56px）
        */}
        <main className="flex-1 pt-14 pb-14">{children}</main>

        {/* 站点级页脚：公司信息、链接与版权 */}
        <Footer />

        {/* 浮动询盘按钮 —— 全站可见的常驻组件 */}
        <FloatingInquiry />
      </body>
    </html>
  );
}
