/**
 * @fileoverview 公开系统设置 API 客户端
 *
 * 从后端 /api/v1/public/settings 获取可配置的联系信息，
 * 供 Server Component 在 ISR 构建时调用，带 5 分钟 revalidate 缓存。
 * 返回空对象时由调用方 fallback 到 content-data.ts 硬编码常量。
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 后端公开设置接口返回的联系信息字段。
 * 所有字段均为可选 —— 未在后端配置时不会出现。
 */
export interface PublicSettings {
  company_email?: string;
  company_phone?: string;
  company_whatsapp?: string;
  company_address?: string;
  company_linkedin?: string;
  company_youtube?: string;
  company_facebook?: string;
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
