import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8080/api/:path*" },
      { source: "/uploads/:path*", destination: "http://localhost:8080/uploads/:path*" },
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
