"use client";

// 页脚「Cookie Settings」触发器：派发事件让 CookieConsent 重新打开偏好面板。
// 独立为客户端小组件，保持 Footer 仍为服务端组件。

import { cn } from "@/lib/utils";

export default function CookieSettingsTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("cookie-settings:open"))}
      className={cn(
        "min-h-11 rounded-md text-[14px] text-[#62676e] transition-colors duration-[330ms] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      )}
    >
      Cookie Settings
    </button>
  );
}
