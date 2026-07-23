/*
 * 文件：components/SearchResultCard.tsx
 * 职责：搜索结果单卡（封面图 + 分类标签 + 标题 + 摘要 + 创建时间）。
 * 整卡可点击跳转至 item.url；hover 时轻微上浮 + 阴影 + 图片微缩放，标题变蓝。
 * 分类 Badge：product=产品（Electric Blue）/ news=新闻（Carbon Dark），便于一眼区分。
 * 纯展示型服务端组件，无交互状态。
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { SearchResultItem } from "@/lib/api/search";
import { formatDate } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// 分类标签的视觉映射：product 用 Electric Blue，news 用 Carbon Dark。
const KIND_META: Record<SearchResultItem["kind"], { label: string; className: string }> = {
  product: {
    label: "产品",
    className: "bg-[#3E6AE1] text-white border-transparent",
  },
  news: {
    label: "新闻",
    className: "bg-[#171A20] text-white border-transparent",
  },
};

export default function SearchResultCard({ item }: { item: SearchResultItem }) {
  const kind = item.kind === "product" ? "product" : "news";
  const meta = KIND_META[kind];
  // 图片 404 时切换占位
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={item.url}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-white",
        "border border-[#EEEEEE]",
        // hover：轻微上浮 + 阴影过渡 + 边框转蓝（对齐站点 hover 规范）
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:border-[#3E6AE1] hover:shadow-xl"
      )}
    >
      {/* ====================== 封面图区域 ====================== */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[#F4F4F4]">
        {item.coverImage && !imgError ? (
          <Image
            src={item.coverImage}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            onError={() => setImgError(true)}
          />
        ) : (
          // 无封面图时的优雅渐变占位（按类型展示不同图标）
          <Placeholder kind={kind} />
        )}

        {/* 分类标签浮层（左上角） */}
        <span className="absolute left-3 top-3">
          <Badge className={cn("text-xs font-medium shadow-sm", meta.className)}>
            {meta.label}
          </Badge>
        </span>
      </div>

      {/* ====================== 内容区域 ====================== */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#171A20] transition-colors duration-300 group-hover:text-[#3E6AE1]">
          {item.title}
        </h3>

        {item.summary && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-[#5C5E62]">
            {item.summary}
          </p>
        )}

        {/* 创建时间（右下角低调展示） */}
        <div className="mt-auto pt-1 text-xs text-[#8E8E8E]">
          {item.createdTime ? formatDate(item.createdTime) : ""}
        </div>
      </div>
    </Link>
  );
}

/**
 * 无封面图时的渐变占位组件。
 * 使用浅色优雅渐变背景 + 低饱和图标，按类型区分（相机=产品 / 文档=新闻）。
 */
function Placeholder({ kind }: { kind: "product" | "news" }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#EEF1F5] via-[#E3E6EA] to-[#D6DAE0]">
      <svg
        className="h-12 w-12 text-[#B0B1B3]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.25}
        aria-hidden="true"
      >
        {kind === "product" ? (
          <>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </>
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        )}
      </svg>
    </div>
  );
}
