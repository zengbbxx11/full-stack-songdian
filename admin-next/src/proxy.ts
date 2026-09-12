import { NextRequest, NextResponse } from "next/server";
import { decodeJwt, jwtVerify } from "jose";

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
 * 会话恢复（P2-11）：access Cookie 过期但 7 天有效的 refresh Cookie 仍存在时，
 * 在页面入口直接向后端换取新会话并把 Set-Cookie 写回响应，放行到原目标页面；
 * 仅当 refresh 真正失效/后端不可达时才要求重新登录。避免刷新页面即被踢回登录页。
 *
 * 安全约束：``JWT_SECRET`` 为服务端环境变量（切勿加 ``NEXT_PUBLIC_`` 前缀，否则泄露到客户端）。
 * 必须与后端 ``.env`` 的 ``JWT_SECRET`` 相同。生产环境必须配置；未配置时降级为仅校验 exp 的
 * 不安全模式并输出告警（仅用于本地开发）。
 */

const PUBLIC_PATHS = ["/signin", "/signup"];

const JWT_SECRET = process.env.JWT_SECRET;

// 后端代理地址（与 next.config.ts 的 rewrite 目标保持一致）。
const BACKEND_URL =
  process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function isTokenValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  // 生产/正式环境：用 jose 校验 HS256 签名 + 过期（review #13）。
  if (JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"], requiredClaims: ["exp", "sub"],
      });
      return payload.scope === "access";
    } catch {
      return false;
    }
  }

  // 生产缺少密钥时拒绝访问；仅开发环境允许不验签的本地兼容模式。
  if (process.env.NODE_ENV === "production") return false;
  console.warn(
    "[proxy] JWT_SECRET 未配置，token 仅做 exp 校验（不安全降级）。" +
      "生产环境请配置与后端一致的 JWT_SECRET 以启用签名验证。"
  );
  try {
    const payload = decodeJwt(token);
    return payload.scope === "access" && typeof payload.sub === "string" &&
      typeof payload.exp === "number" && Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

/** 兼容提取多条 Set-Cookie（优先 getSetCookie）。 */
function extractSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

// 同一 refresh 会话的并发恢复去重：refresh 为单次使用（后端 SET NX 轮换），
// 并发调用会让只有一个成功、其余被踢回登录页；此处共享同一次刷新结果。
const refreshInFlight = new Map<string, Promise<string[] | null>>();

/**
 * 用 refresh Cookie 换取新会话；成功返回需要写回浏览器的 Set-Cookie 列表，失败返回 null。
 *
 * 直接把请求打到后端（转发 refresh_token），避免依赖浏览器端 JS：页面刷新 / 重新打开后台
 * 时也能在边缘层完成续期。轮换后旧族立即失效（后端 SET NX 保证原子性）。
 */
async function restoreSession(req: NextRequest): Promise<string[] | null> {
  const refresh = req.cookies.get("refresh_token")?.value;
  if (!refresh) return null;

  const inFlight = refreshInFlight.get(refresh);
  if (inFlight) return inFlight;

  const task = (async (): Promise<string[] | null> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/admin/refresh`, {
        method: "POST",
        headers: {
          cookie: `refresh_token=${encodeURIComponent(refresh)}`,
          accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const cookies = extractSetCookies(res);
      return cookies.length > 0 ? cookies : null;
    } catch {
      return null;
    }
  })();

  refreshInFlight.set(refresh, task);
  try {
    return await task;
  } finally {
    refreshInFlight.delete(refresh);
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const token = req.cookies.get("access_token")?.value;

  if (isPublic) {
    // 后端可能已撤销仍未到 exp 的会话；允许显示登录表单，避免来回重定向。
    if (req.nextUrl.searchParams.get("expired") === "1") return NextResponse.next();
    // 已登录却访问登录页 → 跳回首页
    if (token && (await isTokenValid(token))) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!(await isTokenValid(token))) {
    // access 失效：尝试用 refresh 会话在入口静默恢复，成功则放行到原目标页面。
    const restoredCookies = await restoreSession(req);
    if (restoredCookies) {
      const response = NextResponse.next();
      for (const cookie of restoredCookies) response.headers.append("set-cookie", cookie);
      return response;
    }
    const url = new URL("/signin", req.url);
    // 仅当确实存在过 refresh 会话（真正失效）时才提示"登录已过期"。
    if (req.cookies.get("refresh_token")) url.searchParams.set("expired", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 排除 Next 内部资源、后端 API 代理(/api)与媒体代理(/uploads)；其余页面均走守卫。
// 关键一：必须排除整个 /_next——除静态资源外，dev 模式下的 HMR WebSocket（/_next/hmr）
//   也在此前缀下；若被守卫拦截重定向，浏览器握手失败 → 页面永远无法完成注水，
//   表现为"点击下拉/按钮无反应"，且会随访问主机（localhost / 127.0.0.1）不同而时好时坏。
// 关键二：必须排除 /api 与 /uploads，否则登录(/api/v1/admin/login)等接口请求会被守卫
//   当成"未登录页面"重定向到 /signin，导致浏览器端永远登录失败。
export const config = {
  matcher: ["/((?!_next/|favicon.ico|api/|uploads/).*)"],
};
