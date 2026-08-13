"use client";

// Cookie 同意横幅（公开官网 frontend）
// 设计约束（与官网 Tesla 极简体系一致）：
//  - 白底卡片 + 极淡描边（ring，不用阴影）、Carbon 文字、Electric Blue 仅用于主 CTA；
//  - 4px 圆角（按钮）/ 12px（卡片）、0.33s 过渡、无渐变；
//  - 移动端优先：小屏整块堆叠，大屏横向操作区；
//  - 仅在用户接受「分析」类且配置了 NEXT_PUBLIC_GA_ID 时注入 Google Analytics；
//  - 监听 "cookie-settings:open" 事件，供页脚「Cookie Settings」重新打开偏好面板。

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { Settings2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sd-cookie-consent";
const CONSENT_VERSION = 1;

type ConsentState = {
  necessary: true;
  analytics: boolean;
  ts: number;
  v: number;
};

type CategoryId = "necessary" | "analytics";

type Category = {
  id: CategoryId;
  title: string;
  description: string;
  locked?: boolean;
};

const CATEGORIES: Category[] = [
  {
    id: "necessary",
    title: "Strictly necessary",
    description:
      "Required for core site functionality and security. These cannot be switched off.",
    locked: true,
  },
  {
    id: "analytics",
    title: "Analytics",
    description:
      "Help us measure traffic and improve the site. Aggregated and non-identifying. Active only when Google Analytics is enabled.",
  },
];

export default function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [show, setShow] = useState(false);
  const [view, setView] = useState<"banner" | "preferences">("banner");
  const [analyticsToggle, setAnalyticsToggle] = useState(false);

  // 挂载后读取已存同意；无记录则展示横幅（避免 SSR 水合不一致）
  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ConsentState;
          if (parsed && parsed.v === CONSENT_VERSION) {
            setConsent(parsed);
            setAnalyticsToggle(parsed.analytics);
            return;
          }
        }
      } catch {
        // 解析失败则视为未同意，展示横幅
      }
      setShow(true);
    });
  }, []);

  // 页脚「Cookie Settings」触发重新打开偏好面板
  useEffect(() => {
    const onOpen = () => {
      setAnalyticsToggle(consent?.analytics ?? false);
      setView("preferences");
      setShow(true);
    };
    window.addEventListener("cookie-settings:open", onOpen);
    return () => window.removeEventListener("cookie-settings:open", onOpen);
  }, [consent]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("cookie-consent:visibility", { detail: show }));
    return () => {
      window.dispatchEvent(new CustomEvent("cookie-consent:visibility", { detail: false }));
    };
  }, [show]);

  function persist(analytics: boolean) {
    const next: ConsentState = {
      necessary: true,
      analytics,
      ts: Date.now(),
      v: CONSENT_VERSION,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 隐私模式等写入失败：仍按本次选择更新内存态
    }
    setConsent(next);
    setShow(false);
  }

  if (!mounted) return null;

  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <>
      {/* Google Analytics —— 仅当用户接受「分析」类 Cookie 且配置了 GA_ID 时注入 */}
      {consent?.analytics && gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');`}
          </Script>
        </>
      )}

      {show && (
        <div
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl animate-fade-in-up motion-reduce:animate-none md:inset-x-4 md:bottom-4"
        >
          <div className="rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 p-3">
            {view === "banner" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-medium text-foreground">We use cookies</h2>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    We use cookies to keep the site running and, with your permission, to
                    understand how visitors use it. See our{" "}
                    <Link
                      href="/privacy-policy#cookies"
                      className="font-medium text-primary hover:underline"
                    >
                      cookie policy
                    </Link>{" "}
                    for details.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAnalyticsToggle(consent?.analytics ?? false);
                      setView("preferences");
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Manage
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => persist(false)}>
                    Reject
                  </Button>
                  <Button variant="default" size="sm" onClick={() => persist(true)}>
                    Accept all
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setView("banner")}
                    aria-label="Back to overview"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <h2 className="text-sm font-medium text-foreground">Cookie preferences</h2>
                </div>

                <ul className="mt-3 space-y-2.5">
                  {CATEGORIES.map((cat) => {
                    const checked = cat.locked ? true : analyticsToggle;
                    return (
                  <li
                    key={cat.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-2.5"
                  >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{cat.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {cat.description}
                          </p>
                        </div>
                        <Switch
                          label={cat.title}
                          checked={checked}
                          disabled={cat.locked}
                          onChange={setAnalyticsToggle}
                        />
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => persist(false)}
                    className="order-2 w-full sm:order-1 sm:w-auto"
                  >
                    Reject all
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => persist(analyticsToggle)}
                    className="order-1 w-full sm:order-2 sm:w-auto"
                  >
                    Save preferences
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// 无障碍开关（role="switch"），视觉沿用官网色板
function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[330ms] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        checked ? "bg-primary" : "bg-gray-300",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-[330ms]",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
