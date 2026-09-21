import React from "react";
import { twMerge } from "tailwind-merge";

/*
 * 后台移动端列表卡片版式（<768px 展示）。
 * 与询盘页既有的卡片实现保持同一套视觉语言（卡片圆角/边框/内边距、卡头左侧 min-w-0 + 右侧徽章 shrink-0、
 * 操作区可换行且触控目标 ≥40px），供产品/新闻列表的移动分支共用，避免同一样式在多处重复维护。
 *
 * 说明：卡片与桌面表格是"两套 DOM、按断点显隐"（表格 hidden md:block、卡片 md:hidden），断点与 inquiries 页一致。
 * 隐藏分支是 display:none，不参与角色匹配，因此两边的可访问名称（如「全选产品」「选择 X」）刻意保持相同。
 */

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function MobileCard({ children, className = "" }: MobileCardProps) {
  // article 语义与询盘页卡片一致，便于按角色定位与屏幕阅读器分段
  return (
    <article className={twMerge("rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]", className)}>
      {children}
    </article>
  );
}

// 卡片头部：左侧标题信息用 min-w-0 截断，右侧徽章 shrink-0 不被压缩
export function MobileCardHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3">{children}</div>;
}

// 卡片操作区：允许换行排列
export function MobileCardActions({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={twMerge("mt-3 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/**
 * 卡片内操作按钮/链接的统一样式：触控高度 ≥40px（手指可点），
 * 默认中性色，调用方可传 `text-red-600 border-red-200` 之类覆盖（twMerge 保证覆盖生效）。
 */
export function mobileActionClass(extra = "") {
  return twMerge(
    "inline-flex min-h-10 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
    extra
  );
}

// 纯图标按钮（上移/下移等）的统一触控尺寸
export function mobileIconButtonClass(extra = "") {
  return twMerge(
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800",
    extra
  );
}
