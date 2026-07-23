"use client";

// 客户端组件：固定底部咨询栏（纯展示，CTA 跳转到 /contact）
/**
 * Tesla 风格持久底部咨询栏
 * ------------------------------------------------------------------
 * 固定在 viewport 底部，白色背景，顶部极细边框。
 * 始终可见，不使用滚动监听（保持代码简洁）。
 */

import Link from "next/link";

/**
 * Tesla 持久底部栏：
 * - 固定在 viewport 底部，fixed bottom-0 left-0 right-0 z-50
 * - 白色背景，顶部 #EEEEEE 极细边框
 * - 高度 56px
 * - 左侧 "Quick Inquiry" 文字（14px，Carbon Dark），右侧蓝色 CTA
 * - 0.33s 过渡
 */
export default function FloatingInquiry() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white flex items-center justify-between px-6"
      style={{
        height: "56px",
        borderTop: "1px solid #EEEEEE",
        transition: "all 0.33s ease",
      }}
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

      <Link
        href="/contact"
        className="inline-flex items-center px-6 text-white text-sm font-medium rounded bg-[#3E6AE1] hover:bg-[#3561CC] transition-colors duration-[330ms]"
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#FFFFFF",
          height: "36px",
          borderRadius: "4px",
        }}
      >
        Send Inquiry
        <svg
          className="w-4 h-4 ml-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
      </Link>
    </div>
  );
}
