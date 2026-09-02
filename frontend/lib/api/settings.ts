/**
 * @fileoverview 公开系统设置 API 客户端
 *
 * 从后端 /api/v1/public/settings 获取可配置的联系信息，
 * 供 Server Component 在 ISR 构建时调用，带 5 分钟 revalidate 缓存。
 * 返回空对象时由调用方 fallback 到 content-data.ts 硬编码常量。
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 后端公开设置接口返回的联系信息和分析工具配置字段。
 * 所有字段均为可选 —— 未在后端配置时不会出现。
 */
export interface PublicSettings {
  ga_id?: string;
  clarity_id?: string;
  company_email?: string;
  company_phone?: string;
  company_whatsapp?: string;
  company_address?: string;
  company_linkedin?: string;
  company_youtube?: string;
  company_facebook?: string;
}

/** Missing configuration preserves legacy env installs; an explicit empty value disables GA. */
export function resolveGaId(settings: PublicSettings | null, fallback?: string): string | null {
  const value = settings && Object.hasOwn(settings, "ga_id") ? settings.ga_id : fallback;
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^G-[A-Z0-9]+$/i.test(candidate) ? candidate : null;
}

/**
 * 获取公开系统设置（联系信息、社交链接等）。
 *
 * 使用 Next.js ISR revalidate = 300s（5 分钟缓存），
 * 后端不可用或请求失败时返回空对象，由调用方 fallback。
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/settings`, {
      next: { revalidate: 300 }, // ISR 5分钟缓存
    });
    if (!res.ok) throw new Error("Failed to fetch settings");
    const json = await res.json();
    return json.code === "0" ? json.data : {};
  } catch {
    return {}; // 返回空对象，由调用方 fallback
  }
}

/**
 * 在浏览器端读取公开设置。
 *
 * CookieConsent 在运行时读取后台保存的 GA / Clarity ID。
 * 使用 no-store 避免浏览器缓存旧配置；后端仍会使用自己的公开设置缓存。
 * 请求最多等待 5 秒，失败返回 null，区分“后台明确为空”和“接口不可用”。
 */
export async function getPublicSettingsClient(): Promise<PublicSettings | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/settings`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Failed to fetch public settings");
    const json = await res.json();
    if (json.code !== "0" && json.code !== 0) return null;
    if (!json.data || typeof json.data !== "object" || Array.isArray(json.data)) return null;
    return json.data as PublicSettings;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
