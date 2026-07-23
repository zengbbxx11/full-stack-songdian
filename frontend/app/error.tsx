"use client";

/**
 * 全局错误边界 — 捕获服务端/客户端渲染错误
 * ------------------------------------------------------------------
 * 当页面数据获取失败或组件抛出未处理异常时展示此页面。
 * 提供「重试」按钮让用户重新加载当前页面。
 */
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 mb-6 rounded-full bg-[#F4F4F4] flex items-center justify-center">
        <svg
          className="w-8 h-8 text-[#8E8E8E]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-[#171A20] mb-3">Something went wrong</h1>
      <p className="text-sm text-[#5C5E62] max-w-md mb-8">
        We encountered an unexpected error. This might be temporary — please try again.
      </p>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center px-6 text-white text-sm font-medium rounded h-[42px] transition-colors"
          style={{
            backgroundColor: "#3E6AE1",
            borderRadius: "4px",
            transitionDuration: "0.33s",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center px-6 text-sm font-medium rounded h-[42px] border border-[#D0D1D2] text-[#393C41] transition-colors hover:bg-[#F4F4F4]"
          style={{
            borderRadius: "4px",
            transitionDuration: "0.33s",
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
