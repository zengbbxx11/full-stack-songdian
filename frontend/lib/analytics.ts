/**
 * GA4 事件追踪 — 安全封装。
 * gtag 仅在用户同意 Cookie 且配置了 NEXT_PUBLIC_GA_ID 时可用。
 * 无 gtag 时静默跳过（不抛错、不阻塞页面）。
 */

type GtagParams = Record<string, string | number | boolean>;

/**
 * 判断 gtag 是否就绪（用户已同意 Cookie + GA_ID 已配置）。
 */
function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof (window as any).gtag === "function";
}

/**
 * 发送 GA4 自定义事件。
 * 用法: trackEvent("cta_click", { cta_label: "Hero CTA", page: "/" })
 */
export function trackEvent(eventName: string, params?: GtagParams): void {
  if (!gtagReady()) return;
  try {
    (window as any).gtag("event", eventName, params ?? {});
  } catch {
    // GA 挂了不影响页面，静默吞掉
  }
}
