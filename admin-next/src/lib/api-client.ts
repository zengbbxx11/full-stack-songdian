/*
 * 统一 API 客户端层（issue #5）。
 *
 * 所有后台页面通过本模块访问后端 /api/v1 接口，统一处理：
 * - 鉴权令牌：从 localStorage 读取（单一来源），并随请求附带 Bearer。
 * - 路径前缀：自动补齐 /api/v1（传入 /admin/xxx 或 /products 均可）。
 * - 响应信封：后端统一返回 { code, msg, data }，code !== "0" 视为业务错误并抛出 ApiError。
 * - 401 处理：清除本地令牌并跳转 /signin（仅浏览器端、且当前不在登录页时）。
 *
 * 注意：HttpOnly 的 `access_token` Cookie 由后端 Set-Cookie 下发，前端无法（也不应）用
 * document.cookie 写入/读取；localStorage 中的令牌仅用于接口 Bearer 鉴权（见 issue #3）。
 */

/** 令牌在 localStorage 中的键名（与后端 JWT 约定一致）。 */
export const TOKEN_KEY = "admin_token";

/** 后端 API 基础地址（用于拼接上传文件的完整 URL）。 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** API 路由统一前缀。 */
const API_PREFIX = "/api/v1";

/**
 * 统一 API 错误类型。携带 HTTP 状态码与后端返回的业务消息，便于页面做差异化提示。
 */
export class ApiError extends Error {
  /** HTTP 状态码（如 401/403/500）。 */
  readonly status: number;
  /** 后端业务码（如 "A040001" / "C4xxxxx"），成功路径为 "0"。 */
  readonly code: string;

  constructor(status: number, message: string, code = "0") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * 读取当前登录令牌（单一来源）。SSR 环境下返回 null。
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 保存令牌到 localStorage（登录成功后调用）。
 */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * 清除本地令牌（退出登录 / 401 时调用）。HttpOnly Cookie 由后端 /logout 清除。
 */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 将相对路径解析为完整 API 路径（自动补齐 /api/v1 前缀；已带前缀或绝对 URL 则原样返回）。
 */
function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith(API_PREFIX)) return path;
  return `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 统一请求方法。
 *
 * @param path    相对或完整 API 路径（如 "/admin/categories"）。
 * @param options fetch 的 RequestInit（body 为对象时请传普通值，本方法会自动 JSON 序列化）。
 * @returns       后端信封中的 `data` 字段（已解包），泛型 T 即 data 的形状。
 * @throws        ApiError —— 非 2xx 或业务 code !== "0" 时抛出。
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  // 自动序列化普通对象 body 为 JSON。
  let body = options.body;
  const headers = new Headers(options.headers);
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    body = JSON.stringify(body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(resolveUrl(path), { ...options, body, headers });

  // 401：令牌失效/未登录 —— 清理本地令牌并跳登录页（登录页自身不跳转，便于展示错误）。
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
      window.location.href = "/signin";
    }
    let message = "登录已过期，请重新登录";
    try {
      const b = await res.json();
      message = b?.msg || b?.message || b?.detail || message;
    } catch {
      /* 响应体不可解析时保留默认文案 */
    }
    throw new ApiError(401, message);
  }

  // 解析响应体（容错：非 JSON 也尽量不崩溃）。
  let payload: { code?: string | number; msg?: string; message?: string; detail?: string; data?: T } | null = null;
  try {
    payload = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(res.status, res.statusText || "请求失败");
    throw new ApiError(res.status, "响应不是合法的 JSON");
  }

  // 后端业务信封：code !== "0" 视为失败（即便 HTTP 200）。
  if (payload && typeof payload === "object" && "code" in payload && payload.code !== "0" && payload.code !== 0) {
    throw new ApiError(
      res.status,
      payload.msg || payload.message || "操作失败",
      String(payload.code)
    );
  }

  if (!res.ok) {
    const message =
      payload?.msg || payload?.message || payload?.detail || res.statusText || "请求失败";
    throw new ApiError(res.status, message);
  }

  // 解包：返回信封中的 data；无 data 字段时返回整个对象（兼容个别直接返回对象的接口）。
  return (payload?.data ?? payload) as T;
}
