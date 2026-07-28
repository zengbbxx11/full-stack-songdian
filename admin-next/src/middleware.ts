import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * 管理后台路由守卫（security-audit F-08 / review #13）。
 *
 * 全栈项目此前无任何前端路由守卫，未登录用户可直接访问 /products、/categories 等
 * 管理页面（仅靠接口层 RBAC 兜底）。本中间件在边缘运行时校验 HttpOnly ``access_token`` cookie
 * （由后端 /api/v1/admin/login 下发，JS 不可读，降低 XSS 窃取风险）：
 * - 登录页 /signin、/signup 始终放行；
 * - 其余页面若缺少有效 token（签名无效或过期）则重定向到 /signin；
 * - 已登录访问登录页则跳回首页。
 *
 * review #13：此前仅 base64 解码 payload 校验 exp，伪造 cookie 即可绕过守卫。
 * 现使用 jose 校验 HS256 签名（密钥须与后端 JWT_SECRET 一致），签名/过期任一不符即判无效。
 *
 * 安全约束：``JWT_SECRET`` 为服务端环境变量（切勿加 ``NEXT_PUBLIC_`` 前缀，否则泄露到客户端）。
 * 必须与后端 ``.env`` 的 ``JWT_SECRET`` 相同。生产环境必须配置；未配置时降级为仅校验 exp 的
 * 不安全模式并输出告警（仅用于本地开发）。
 */

const PUBLIC_PATHS = ["/signin", "/signup"];

const JWT_SECRET = process.env.JWT_SECRET;

async function isTokenValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  // 生产/正式环境：用 jose 校验 HS256 签名 + 过期（review #13）。
  if (JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      await jwtVerify(token, secret, { algorithms: ["HS256"] });
      return true;
    } catch {
      return false;
    }
  }

  // 未配置 JWT_SECRET（仅本地开发）：降级为仅校验 exp 的存在性检查，并告警。
  console.warn(
    "[middleware] JWT_SECRET 未配置，token 仅做 exp 校验（不安全降级）。" +
      "生产环境请配置与后端一致的 JWT_SECRET 以启用签名验证。"
  );
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (!json.exp) return true;
    return Date.now() < json.exp * 1000;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const token = req.cookies.get("access_token")?.value;

  if (isPublic) {
    // 已登录却访问登录页 → 跳回首页
    if (token && (await isTokenValid(token))) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!(await isTokenValid(token))) {
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
