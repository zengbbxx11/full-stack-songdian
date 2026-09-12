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
// 规范化路径**运行时**依据后端当前产品数据解析（见下方 resolveCanonical），
// 因此后台修改产品分类后可立即生效，不再依赖人工重建静态映射。
// lib/generated/canonical-map.ts 仅作为「后端不可达」时的过渡兜底。

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CANONICAL_MAP } from "./lib/generated/canonical-map";

// 仅对 /products/* 生效；其余路由（含 /api、/_next、静态资源）不经过此代理。
export const config = {
  matcher: ["/products/:path*"],
};

// 后端地址：容器内优先用 INTERNAL_API_URL（服务名直连），否则用构建期注入的公开地址。
const API_BASE =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// slug -> 规范路径（null 表示无规范路径）的短时缓存，避免每次请求都打后端。
const CACHE_TTL_MS = 60_000;
const canonicalCache = new Map<string, { path: string | null; expires: number }>();

/** 业务码：产品不存在或已下架（与后端 ErrorCode.A010001 对应）。 */
const CODE_PRODUCT_NOT_FOUND = "A010001";

/**
 * 解析产品的规范路径。
 *
 * 仅对「后端明确响应」的结果写缓存（含明确的 404 负缓存），避免一次网络抖动被固化 60s；
 * 后端不可达时退化为构建期静态映射兜底但不写缓存。
 */
async function resolveCanonical(slug: string): Promise<string | null> {
  const now = Date.now();
  const cached = canonicalCache.get(slug);
  if (cached && cached.expires > now) return cached.path;

  let path: string | null = null;
  let resolvedByBackend = false;
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/products/${encodeURIComponent(slug)}/canonical`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (res.ok) {
      resolvedByBackend = true;
      const body = (await res.json()) as { data?: { canonical_path?: unknown } };
      const canonical = body?.data?.canonical_path;
      if (typeof canonical === "string" && canonical.startsWith("/products/")) {
        path = canonical;
      }
    } else if (res.status === 404) {
      // 404 有两种来源，必须区分，否则前后端版本不一致时旧扁平地址会直接 404：
      // 1) 业务 404：统一信封 code=A010001（产品不存在/未发布）→ 负缓存并放行，
      //    由页面渲染 404；不回退静态映射，否则会把已下架产品 308 到旧分类地址。
      // 2) 路由 404：后端尚未升级到含 canonical 接口的版本（未知路由返回 C404001）
      //    → 视为"后端无法解析"，退回静态映射兜底，避免灰度/回滚期间断链。
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      if (body?.code === CODE_PRODUCT_NOT_FOUND) {
        resolvedByBackend = true;
        path = null;
      }
    }
  } catch {
    // 后端不可达：走下方静态映射兜底（不写缓存）
  }

  if (!resolvedByBackend) {
    // 过渡兜底：仅在后端不可用（或尚未提供该接口）时使用构建期静态映射，避免全站产品被误判 404。
    return CANONICAL_MAP[slug] ?? null;
  }

  canonicalCache.set(slug, { path, expires: now + CACHE_TTL_MS });
  return path;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 拆解路径段：["products", ...rest]
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "products") return NextResponse.next();
  // /products 本身（列表页，可能带 ?category= / ?page=）→ 放行
  if (segments.length < 2) return NextResponse.next();

  const slug = segments[segments.length - 1];
  const canonical = await resolveCanonical(slug);
  // 不在映射中（如不存在的产品）→ 交给页面渲染 404
  if (!canonical) return NextResponse.next();

  // 已是规范地址则放行；否则 308 永久重定向到规范地址（保留 SEO 权重与 query）。
  if (pathname !== canonical) {
    const url = req.nextUrl.clone();
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}
