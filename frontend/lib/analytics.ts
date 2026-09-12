/**
 * GA4 事件追踪 — 安全封装。
 * gtag 仅在用户同意 Cookie 且配置了 NEXT_PUBLIC_GA_ID 时可用。
 * 无 gtag 或用户未同意时静默跳过（不抛错、不阻塞页面）。
 *
 * P2-5：撤回同意后已加载的 window.gtag 仍可能存活，故发送前**实时**校验同意状态，
 * 而非只判断 gtag 是否存在。
 */

import { hasAnalyticsConsent } from "@/lib/consent";

type GtagParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * 判断 gtag 是否就绪（用户仍同意分析 Cookie + GA 脚本已加载）。
 */
function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/**
 * 发送 GA4 自定义事件。
 * 用法: trackEvent("cta_click", { cta_label: "Hero CTA", page: "/" })
 */
export function trackEvent(eventName: string, params?: GtagParams): void {
  // 双重保险：同意状态（入口实时读取）+ gtag 是否就绪。
  if (!hasAnalyticsConsent() || !gtagReady()) return;
  try {
    window.gtag?.("event", eventName, params ?? {});
  } catch {
    // GA 挂了不影响页面，静默吞掉
  }
}
