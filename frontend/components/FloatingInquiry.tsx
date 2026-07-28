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
import { X } from "lucide-react";

export default function FloatingInquiry() {
  // 手动关闭：点击 X 后整栏移除
  const [dismissed, setDismissed] = useState(false);
  // 滚动感知：向下滚动隐藏、向上滚动显示
  const [hidden, setHidden] = useState(false);
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

  if (dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between bg-white px-6 transition-transform duration-300 ease-out"
      style={{
        height: "56px",
        borderTop: "1px solid #EEEEEE",
        transform: hidden ? "translateY(100%)" : "translateY(0)",
      }}
      role="region"
      aria-label="Quick inquiry"
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#171A20",
        }}
      >
        Quick Inquiry
      </span>

      <div className="flex items-center gap-2">
        <Link
          href="/contact"
          className="inline-flex items-center rounded bg-[#d4343e] px-6 text-sm font-medium text-white transition-colors duration-[330ms] hover:bg-[#b91c1c]"
          style={{ height: "36px", borderRadius: "4px" }}
        >
          Send Inquiry
          <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss inquiry bar"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
