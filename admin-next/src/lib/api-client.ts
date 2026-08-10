/*
 * 统一 API 客户端层（issue #5）。
 *
 * 所有后台页面通过本模块访问后端 /api/v1 接口，统一处理：
 * - 鉴权令牌：仅由浏览器自动携带的 HttpOnly Cookie 提供，JavaScript 不接触 JWT。
 * - 路径前缀：自动补齐 /api/v1（传入 /admin/xxx 或 /products 均可）。
 * - 响应信封：后端统一返回 { code, msg, data }，code !== "0" 视为业务错误并抛出 ApiError。
 * - 401 处理：调用 Cookie 刷新接口一次；失败后跳转 /signin。
 */

/** 后端 API 基础地址（用于拼接上传文件的完整 URL）。 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
}

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
 * 将相对路径解析为完整 API 路径（自动补齐 /api/v1 前缀；已带前缀或绝对 URL 则原样返回）。
 */
function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith(API_PREFIX)) return path;
  return `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * apiFetch 的 options 类型：在原生 RequestInit 基础上放宽 body 约束，
 * 允许直接传入普通对象（运行时自动 JSON 序列化），避免每层调用都需手动 stringify。
 */
type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | object | null;
};

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
  options: ApiFetchOptions = {}
): Promise<T> {
  // 自动序列化普通对象 body 为 JSON。
  let body: BodyInit | null | undefined = options.body as BodyInit | null | undefined;
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
    body = JSON.stringify(options.body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const request = () => fetch(resolveUrl(path), {
    ...options, body, headers, credentials: "same-origin",
  });
  let res = await request();

  // access Cookie 过期时仅刷新一次，避免循环；刷新令牌本身只存在于 HttpOnly Cookie。
  const isSessionEndpoint = path.includes("/admin/refresh") || path.includes("/admin/logout");
  if (res.status === 401 && !isSessionEndpoint) {
    const refresh = await fetch(`${API_PREFIX}/admin/refresh`, {
      method: "POST", headers: { Accept: "application/json" }, credentials: "same-origin",
    });
    if (refresh.ok) {
      const refreshPayload = await refresh.json().catch(() => null);
      if (refreshPayload?.code === "0" || refreshPayload?.code === 0) res = await request();
    }
  }

  // 401：刷新失败或仍未登录，跳回登录页（登录页自身不跳转，便于展示错误）。
  if (res.status === 401) {
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

/** 拉取所有分页，供后台需要全量排序/统计的功能使用。后端单页上限为 50。 */
export async function apiFetchAllPages<T>(
  path: string,
  pageSize = 50,
): Promise<PaginatedData<T>> {
  const base = new URL(path, "http://internal.local");
  const list: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const current = new URL(base);
    current.searchParams.set("page", String(page));
    current.searchParams.set("page_size", String(Math.min(pageSize, 50)));
    const data = await apiFetch<PaginatedData<T>>(`${current.pathname}${current.search}`);
    list.push(...(data.list ?? []));
    total = data.total ?? list.length;
    page += 1;
    if (!data.list?.length) break;
  } while (list.length < total);

  return { list, total, page: 1, page_size: Math.min(pageSize, 50) };
}

/**
 * SWR 默认 fetcher（见 issue #23 渐进式接入）。
 *
 * 直接复用 `apiFetch` 的 Cookie 会话、信封解包与 401 跳转逻辑，
 * 各页面可用 `useSWR<DataType>(key, swrFetcher)` 拿到已解包的业务数据，
 * 无需在每个页面重复编写 fetch + try/catch + toast 样板。
 */
export function swrFetcher<T = unknown>(path: string): Promise<T> {
  return apiFetch<T>(path);
}
