/**
 * @fileoverview 公开系统设置 API 客户端
 *
 * 从后端 /api/v1/public/settings 获取可配置的联系信息，
 * 供 Server Component 在 ISR 构建时调用，带 5 分钟 revalidate 缓存。
 * 返回空对象时由调用方 fallback 到 content-data.ts 硬编码常量。
 */

import { API_BASE, apiFetch, toAbsoluteUrl } from "./client";

/**
 * 后端公开设置接口返回的联系信息和分析工具配置字段。
 * 所有字段均为可选 —— 未在后端配置时不会出现。
 */
export interface PublicSettings {
  ga_id?: string;
  clarity_id?: string;
  google_verification?: string;
  company_email?: string;
  company_phone?: string;
  company_whatsapp?: string;
  company_address?: string;
  company_linkedin?: string;
  company_youtube?: string;
  company_facebook?: string;
  /** 官网首页轮播图，JSON 数组字符串：[{"url":"/uploads/…","enabled":true,"href":""} ×3] */
  home_banners?: string;
}

/** 单张首页轮播图（解析后的安全形态）。`href` 为空表示整图不可点。 */
export interface HomeBanner {
  /** 桌面/通用图（<768px 未配 mobileUrl 时手机也用它） */
  url: string;
  /** 移动端专用竖版图（art direction）：非空时手机端只加载这张，避免宽图被裁成一条 */
  mobileUrl: string;
  href: string;
}

/** 首页轮播最多 3 张（与后台面板槽位一致）。 */
const HOME_BANNER_MAX = 3;

/** 后台槽位的安全形态：url 已绝对化，href 通过协议校验（非法链接返回 null）。 */
interface RawSlot {
  url: string;
  mobileUrl: string;
  enabled: boolean;
  href: string | null;
}

/** 站内相对路径或 http(s) 绝对地址 → 后端绝对 URL；其它一律拒绝（空串）。 */
function safeImageUrl(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return "";
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return "";
  if (value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "";
  try {
    const url = new URL(value, API_BASE);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
  } catch {
    return "";
  }
  return toAbsoluteUrl(value) ?? value;
}

/**
 * 后台槽位 → 安全形态。任何畸形输入（空/非 JSON/字段缺失/类型不对）都退化为空值，
 * 绝不抛错，避免后台数据打断首页渲染。
 */
function parseSlots(value: string | undefined): RawSlot[] {
  const slots: RawSlot[] = [];
  if (!value || typeof value !== "string") return slots;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return slots;
  }
  if (!Array.isArray(parsed)) return slots;
  for (const item of parsed.slice(0, HOME_BANNER_MAX)) {
    // Preserve positions: malformed slots must not promote a later slide to the lead.
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      slots.push({ url: "", mobileUrl: "", enabled: false, href: null });
      continue;
    }
    const record = item as { url?: unknown; mobileUrl?: unknown; enabled?: unknown; href?: unknown };
    // 非法链接只丢弃链接（保留图片），不整张丢弃
    const rawHref = typeof record.href === "string" ? record.href.trim() : "";
    const hrefOk = rawHref === "" || (!rawHref.startsWith("//") && !rawHref.startsWith("/\\") && (rawHref.startsWith("/") || /^https?:\/\//i.test(rawHref)));
    slots.push({
      url: safeImageUrl(record.url),
      mobileUrl: safeImageUrl(record.mobileUrl),
      enabled: record.enabled === true,
      href: hrefOk ? rawHref : null,
    });
  }
  return slots;
}

/**
 * 解析后台配置的首页轮播图。
 *
 * 返回数组的**第 1 项恒为「首屏主图」**：取第 1 槽的图片，留空时 `url` 为空字符串，
 * 由渲染层回退到官网默认 Banner（保持改版前的首屏）；其后依次是第 2、3 槽中已启用的图。
 * 这样「原有第一张图保持原样」是默认行为 —— 只有运营给第 1 槽选了图才会替换。
 */
export function parseHomeBanners(value: string | undefined): HomeBanner[] {
  const slots = parseSlots(value);
  const banners: HomeBanner[] = [{ url: slots[0]?.url ?? "", mobileUrl: slots[0]?.mobileUrl ?? "", href: "" }];
  for (const slot of slots.slice(1)) {
    if (!slot.enabled || !slot.url) continue;
    banners.push({ url: slot.url, mobileUrl: slot.mobileUrl, href: slot.href ?? "" });
    if (banners.length >= HOME_BANNER_MAX) break;
  }
  return banners;
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
    const data = await apiFetch<PublicSettings>("/api/v1/public/settings", undefined, { revalidate: 300, tags: ["public-settings"] });
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
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
