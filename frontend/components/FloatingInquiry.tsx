"use client";

// 客户端组件：固定底部咨询栏（可手动关闭 + 滚动感知显隐）
/**
 * Tesla 风格持久底部咨询栏
 * ------------------------------------------------------------------
 * 固定在 viewport 底部，白色背景，顶部极细边框。
 * - 向下滚动超过阈值时自动隐藏（translateY 收起），向上滚动时重新显示，
 *   避免长时间遮挡正文 / CTA（尤其移动端）。
 * - 右侧提供关闭按钮，点击后本会话不再显示。
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

export default function FloatingInquiry() {
  const pathname = usePathname();
  // 手动关闭：点击 X 后整栏移除
  const [dismissed, setDismissed] = useState(false);
  // 滚动感知：向下滚动隐藏、向上滚动显示
  const [hidden, setHidden] = useState(false);
  const [cookieVisible, setCookieVisible] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      // 向下滚动且越过 120px 阈值时隐藏；反向（向上）滚动时显示
      if (y > lastY.current && y > 120) setHidden(true);
      else setHidden(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onCookieVisibility = (event: Event) => {
      setCookieVisible((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener("cookie-consent:visibility", onCookieVisibility);
    return () => window.removeEventListener("cookie-consent:visibility", onCookieVisibility);
  }, []);

  if (dismissed || cookieVisible || pathname === "/contact") return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 shadow-[0_-10px_30px_rgba(17,19,22,0.08)] backdrop-blur-xl transition-transform duration-300 ease-out"
      style={{
        height: "56px",
        transform: hidden ? "translateY(100%)" : "translateY(0)",
      }}
      role="region"
      aria-label="Quick inquiry"
    >
      <div className="flex h-full w-full items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <span className="min-w-0 truncate text-[14px] font-medium text-[#171A20] sm:text-[15px]">
          Discuss your camera project
        </span>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Link
          href="/contact"
          className="inline-flex h-9 items-center rounded-lg bg-[#d4343e] px-4 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#b91c1c] sm:px-6"
        >
          Send Inquiry
          <svg className="ml-1.5 hidden h-4 w-4 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss inquiry bar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        </div>
      </div>
    </div>
  );
}
