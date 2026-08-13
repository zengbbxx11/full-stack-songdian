/**
 * 媒体资源映射表 — 本地静态资源统一管理
 * ------------------------------------------------------------------
 * 所有页面级图片（Hero、OG、图标等）统一在这里配置。
 * 产品图和新闻图由 FastAPI 后端（/uploads/）提供，不在此列。
 *
 * 🔧 换图流程：
 *   1. 将新图片放入 frontend/public/ 对应目录
 *   2. 更新下方对应字段
 *   3. 保存文件 ��� 全站自动更新
 *
 * 📁 public/ 目录结构：
 *   banner/   ← 首页 Banner
 *   Favicon/  ← 浏览器图标
 *   根目录     ← logo.png 等全局资源
 */

// ================================================================
// 📸 页面图片
// ================================================================

export const MEDIA = {
  /** Logo */
  logo: "/logo.png",

  /** 首页 Hero Banner */
  heroBanner: "/banner/banner.webp",

  /** 社交媒体分享预览图；复用已核实的 1920×800 工厂实景横幅。 */
  ogImage: "/banner/banner.webp",

  /** 工厂宣传视频 */
  factoryVideo: "/Video/SongdianFactoryVideo.mp4",

  /** 全球 ODM 合作伙伴图 */
  globalOdmPartners: "/global-odm-partners.jpg",
} as const;
