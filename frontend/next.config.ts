import type { NextConfig } from "next";

// 仅本地开发允许图片优化器取 loopback/局域网图片。
// 生产构建（NODE_ENV=production）恒为 false，避免误把该开关带进生产。
const allowLocalImageOptimization =
  process.env.NODE_ENV !== "production" &&
  process.env.ALLOW_LOCAL_IMAGE_OPTIMIZATION === "true";

// 本地开发最容易踩的坑：NEXT_PUBLIC_API_URL 指向 loopback 后端，却没开
// ALLOW_LOCAL_IMAGE_OPTIMIZATION。此时图片优化器会拒绝全部后端图片
// （/_next/image 返回 400 "url" parameter is not allowed），页面只表现为
// 图片空白，不报错也看不到原因，很容易被误判成「图片丢了」。
// 这里在开发模式提前给出可操作提示。
const LOOPBACK_API_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

if (
  process.env.NODE_ENV !== "production" &&
  !allowLocalImageOptimization &&
  LOOPBACK_API_RE.test(process.env.NEXT_PUBLIC_API_URL ?? "")
) {
  console.warn(
    "[next.config] NEXT_PUBLIC_API_URL 指向本地/局域网地址，但 " +
      "ALLOW_LOCAL_IMAGE_OPTIMIZATION 未开启：官网所有后端图片（/_next/image）" +
      "都会返回 400 并显示为空白。请在 frontend/.env.local 设置 " +
      "ALLOW_LOCAL_IMAGE_OPTIMIZATION=true 后重启开发服务器。",
  );
}

const nextConfig: NextConfig = {
  // 独立输出：适配 Next 16 官方 Docker 运行方式（next start + .next/standalone）
  output: "standalone",
  images: {
    // 启用 AVIF + WebP 现代图片格式 — 比 JPEG/PNG 小 30-50%，弱网体验显著提升
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8080",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8080",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/**",
      },
      // Production: 后端静态资源仅允许 HTTPS API 域名。
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_IMAGE_HOST || "api.zsaki.icu",
        pathname: "/uploads/**",
      },
    ],
    // 允许优化本机回环地址的图片 —— 仅本地开发需要（图片优化器由服务端取图，
    // 放开本地 IP 会扩大 SSRF 面）。生产部署使用 HTTPS API 域名，必须保持关闭。
    // 本地在 .env.local 中设置 ALLOW_LOCAL_IMAGE_OPTIMIZATION=true 开启。
    dangerouslyAllowLocalIP: allowLocalImageOptimization,
    // 外部图片优化的缓存时长（秒）
    minimumCacheTTL: 3600,
    // 根据实际布局断点优化响应式图片尺寸
    deviceSizes: [480, 640, 768, 1024, 1280, 1536],
    // 图片优化尺寸断点（配合 next/image 的 sizes 属性）
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384, 512, 768],
  },

  // Fix turbopack root warning caused by parent package-lock.json
  turbopack: {
    root: __dirname,
  },

  // Gzip compression
  compress: true,

  // 隐藏 Next.js 版本信息（安全）
  poweredByHeader: false,

  // 生产环境不暴露源码映射
  productionBrowserSourceMaps: false,

  // 生产环境移除 console（保留 error/warn）
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  // Tree-shaking 优化大包
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
    // 本地/生产构建共用公开 API 限流；串行预渲染可复用数据缓存并避免突发 429。
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 100,
  },

  // 旧路由永久重定向（SEO + 书签兼容）
  // /services → /solutions（2026-07 路由重构）
  // /blog → /news、/inquiry → /contact（旧路径清理）
  async redirects() {
    return [
      { source: "/services", destination: "/solutions", permanent: true },
      { source: "/services/faq", destination: "/solutions/faq", permanent: true },
      { source: "/blog", destination: "/news", permanent: true },
      { source: "/blog/:slug*", destination: "/news/:slug*", permanent: true },
      { source: "/inquiry", destination: "/contact", permanent: true },
    ];
  },
};

export default nextConfig;
