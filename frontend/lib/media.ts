/**
 * 媒体资源映射表 — WordPress + FileBird 统一管理
 * ------------------------------------------------------------------
 * 所有页面级图片（Hero、OG、图标等）统一在这里配置。
 * 产品图和文章图由 WooCommerce/WordPress 自动管理，不在此列。
 *
 * 🔧 换图流程：
 *   1. FileBird → Website/{对应文件夹} → 上传新图片
 *   2. 在 WordPress 媒体库中复制新图片的完整 URL
 *   3. 粘贴到下方对应字段
 *   4. 保存文件 → 全站自动更新
 *
 * 📁 FileBird 文件夹结构：
 *   Website /
 *     Hero /     ← 首页 Banner
 *     OG /       ← 社交分享预览图
 *     Icons /    ← 页面图标
 */

// WordPress 媒体库基础 URL（来自环境变量，开发环境回退到 localhost:10004）
const WP_BASE = process.env.NEXT_PUBLIC_WORDPRESS_URL || "http://localhost:10004";

// 根据上传年月目录与文件名拼接 WordPress 媒体文件的完整 URL
function wpFile(yearMonth: string, filename: string): string {
  return `${WP_BASE}/wp-content/uploads/${yearMonth}/${filename}`;
}

// ================================================================
// 📸 页面图片 — 每个字段对应一个 FileBird 文件夹
// ================================================================

export const MEDIA = {
  /** Logo — 本地图片，不动 */
  logo: "/logo.png",

  /** ── FileBird: Website/Hero ── */
  heroBanner: wpFile("2026/06", "banner.webp"),

  /** ── FileBird: Website/OG ── */
  ogImage: wpFile("2026/07", "og-image.jpg"),

  /** ── 工厂宣传视频（本地静态资源，避免 WordPress URL 跨环境问题） ── */
  factoryVideo: "/Video/SongdianFactoryVideo.mp4",

  /** ── 全球 ODM 合作伙伴图（本地静态资源） ── */
  globalOdmPartners: "/global-odm-partners.jpg",

  /** ── FileBird: Website/Icons ── */
  icons: {
    // iso:     wpFile("2026/07", "iso-certified.svg"),
    // factory: wpFile("2026/07", "factory.svg"),
    // globe:   wpFile("2026/07", "globe.svg"),
    // patent:  wpFile("2026/07", "patent.svg"),
  },
} as const;
