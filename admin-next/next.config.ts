import type { NextConfig } from "next";

// 后端代理地址：admin-next 服务端代理 /api 与 /uploads 时使用。
// - 本地开发：http://localhost:8080
// - Docker Compose：http://backend:8000（compose 服务名 DNS，容器间直连，不走公网回环）
// 优先级：BACKEND_PROXY_URL > NEXT_PUBLIC_API_URL > localhost:8080
const backendProxyUrl =
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

const nextConfig: NextConfig = {
  // 独立输出：适配 Next 16 官方 Docker 运行方式（next start + .next/standalone）
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendProxyUrl}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backendProxyUrl}/uploads/:path*` },
    ];
  },

  // 注意：SVG 图标改用内联 React 组件（src/icons/generated.tsx），
  // 不再通过 @svgr/webpack 处理——本机 Turbopack 的 webpack-loader worker
  // 进程会崩溃（exit 1），而 @svgr/webpack 正走该 worker，故移除之。
  // @svgr/webpack 才是当初 500 的真正元凶，与 postcss 无关。
  //
  // 样式修复（"没有样式了"）：本目录须保留 postcss.config.mjs（@tailwindcss/postcss），
  // 让 Tailwind 走自身的 PostCSS 内容探测。若删除它，Next 16 Turbopack 会改用
  // 原生 Tailwind 扫描，而本机因上层 "Front-end project/package-lock.json"
  // 被误判为 workspace 根，原生扫描只扫到 globals.css 自身，漏掉 src 下 .tsx
  // 里的 flex/grid/fixed/block 等布局工具类，整页无样式。复用 postcss.config.mjs
  // （与 frontend 一致）后 Tailwind 内容探测正确，完整 CSS 恢复，且无崩溃。
  //
  // 不设置 turbopack.root：仅在原生 Tailwind 下影响内容扫描（已弃用该路径），
  // 现在走 postcss 无需它；保留会触发"多 lockfile 根推断"警告（无害）。
};

export default nextConfig;
