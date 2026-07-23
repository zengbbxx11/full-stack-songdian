import { NextRequest, NextResponse } from "next/server";

/**
 * 管理后台路由守卫（security-audit F-08）。
 *
 * 全栈项目此前无任何前端路由守卫，未登录用户可直接访问 /products、/categories 等
 * 管理页面（仅靠接口层 RBAC 兜底）。本中间件在边缘运行时校验 ``admin_token`` cookie：
 * - 登录页 /signin、/signup 始终放行；
 * - 其余页面若缺少有效 token（含过期）则重定向到 /signin；
 * - 已登录访问登录页则跳回首页。
 *
 * 注：token 以可读 cookie 形式存储（仅供守卫做存在性/过期校验），实际接口鉴权仍由
 * 客户端从 localStorage 读取并以 Bearer 头发送，XSS 暴露面与改造前一致。
 */

const PUBLIC_PATHS = ["/signin", "/signup"];

function isTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (!json.exp) return true; // 无过期声明则仅校验存在性
    return Date.now() < json.exp * 1000;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const token = req.cookies.get("admin_token")?.value;

  if (isPublic) {
    // 已登录却访问登录页 → 跳回首页
    if (token && isTokenValid(token)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!isTokenValid(token)) {
    const url = new URL("/signin", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 排除静态资源、后端 API 代理(/api)与媒体代理(/uploads)；其余页面均走守卫。
// 关键：必须排除 /api 与 /uploads，否则登录(/api/v1/admin/login)等接口请求会被守卫
// 当成"未登录页面"重定向到 /signin，导致浏览器端永远登录失败。
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|uploads/).*)"],
};
