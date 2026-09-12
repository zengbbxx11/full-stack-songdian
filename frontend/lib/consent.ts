/**
 * Cookie 同意状态的统一读取与 GA 停用助手（公开官网）。
 *
 * 背景（P2-5）：撤回「分析」同意后，之前注入的 window.gtag 仍然存在，
 * 仅靠「注入阶段」判断同意不足以在撤回后停止发送。此处提供：
 * - hasAnalyticsConsent()：事件入口实时读取当前同意状态；
 * - syncAnalyticsConsent()：依据同意结果显式启用/停用已加载的 GA
 *   （官方 `ga-disable-*` 开关 + Consent Mode update），覆盖「接受 → 拒绝 → 继续操作」。
 */

export const CONSENT_STORAGE_KEY = "sd-cookie-consent";
// Clarity 增加了会话回放，故对回访访客提升同意版本以复核范围。
export const CONSENT_VERSION = 2;
export const CONSENT_CHANGED_EVENT = "sd-cookie-consent-changed";

interface StoredConsent {
  necessary?: boolean;
  analytics?: boolean;
  v?: number;
}

/** 读取已持久化的同意状态；未作出选择或版本不匹配时视为未同意。 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredConsent;
    return parsed?.v === CONSENT_VERSION && parsed?.analytics === true;
  } catch {
    // localStorage 不可用（隐私模式等）→ 保守视为未同意
    return false;
  }
}

/**
 * 依据同意结果启用/停用 GA。
 *
 * - 停用：设置官方 `window['ga-disable-<GA_ID>'] = true` 并发送 Consent Mode
 *   `analytics_storage: denied`，使**已加载**的 gtag 立即停止发送事件。
 * - 启用：清除上述开关（用户重新接受后恢复统计）。
 */
export function syncAnalyticsConsent(allowed: boolean, gaId?: string | null): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  const keys = new Set<string>();
  if (gaId) keys.add(`ga-disable-${gaId}`);
  // 兜底：扫描运行时已注入的停用开关（如调用时尚未拿到后台配置的 GA_ID）。
  for (const key of Object.keys(w)) {
    if (key.startsWith("ga-disable-")) keys.add(key);
  }
  for (const key of keys) w[key] = !allowed;

  const gtag = w.gtag;
  if (typeof gtag === "function") {
    (gtag as (...args: unknown[]) => void)("consent", "update", {
      analytics_storage: allowed ? "granted" : "denied",
    });
  }
}
