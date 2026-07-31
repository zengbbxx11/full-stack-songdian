// 产品 URL 规范化中间件（边缘层 308 重定向）。
// Next.js 16 起 middleware 约定更名为 proxy，本文件即替代原 middleware.ts。
//
// 背景：本环境 Next.js 16 + Turbopack 下，App Router 页面组件内的
// redirect()/permanentRedirect() 不会发出真实 3xx，故改在此处统一处理。
//
// 规则：
//   /products/{slug}                  （旧扁平地址）→ 308 到 /products/{category}/{slug}
//   /products/{wrongCategory}/{slug} （分类段错误）  → 308 到 /products/{真实分类}/{slug}
//   /products/{正确分类}/{slug}        （规范地址）    → 放行，由页面渲染
//   /products                          （列表页）      → 放行
//
// 映射数据来自 lib/generated/canonical-map.ts（由 scripts/gen-canonical-map.mjs 生成）。

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CANONICAL_MAP } from "./lib/generated/canonical-map";

// 仅对 /products/* 生效；其余路由（含 /api、/_next、静态资源）不经过此代理。
export const config = {
  matcher: ["/products/:path*"],
};

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 拆解路径段：["products", ...rest]
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "products") return NextResponse.next();
  // /products 本身（列表页，可能带 ?category= 查询参数）→ 放行
  if (segments.length < 2) return NextResponse.next();

  const slug = segments[segments.length - 1];
  const canonical = CANONICAL_MAP[slug];
  // 不在映射中（如不存在的产品）→ 交给页面渲染 404
  if (!canonical) return NextResponse.next();

  // 已是规范地址则放行；否则 308 永久重定向到规范地址（保留 SEO 权重）
  if (pathname !== canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}
