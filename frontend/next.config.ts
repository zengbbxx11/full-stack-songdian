import type { NextConfig } from "next";

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
      // Production: 后端静态资源（部署时改为实际 IP/域名）
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_IMAGE_HOST || "api.songdian.tech",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: process.env.NEXT_PUBLIC_IMAGE_HOST || "106.53.220.184",
        pathname: "/**",
      },
    ],
    // 允许优化本机回环地址的图片（本地后端开发环境）
    dangerouslyAllowLocalIP: true,
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
