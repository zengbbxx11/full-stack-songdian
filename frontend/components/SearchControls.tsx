"use client";

/*
 * 文件：components/SearchControls.tsx（客户端组件）
 * 职责：搜索页顶部的搜索输入框（带搜索图标）+ 类型切换 Tabs（全部/产品/新闻）。
 * 提交搜索或切换类型时，通过 router.push 导航至 /search?q=...&type=...，
 * 由服务端搜索页重新执行联合搜索并渲染结果网格（保留原有 URL 驱动模式）。
 *
 * 注意：初始值由服务端页面通过 props 传入（initialQuery / initialType），
 * 避免在客户端读取 useSearchParams 引发静态预渲染的 Suspense 边界报错。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type SearchType = "all" | "product" | "news";

// 类型切换选项
const TABS: { value: SearchType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "product", label: "产品" },
  { value: "news", label: "新闻" },
];

export default function SearchControls({
  initialQuery,
  initialType,
}: {
  initialQuery: string;
  initialType: SearchType;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<SearchType>(initialType);

  // 跳转到搜索页（携带 q 与 type 参数）
  const navigate = (q: string, t: SearchType) => {
    const trimmed = q.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    params.set("type", t);
    const qs = params.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  };

  // 提交搜索（回车 / 点击图标）
  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query, type);
  };

  // 切换类型：已有查询则立即重新搜索；无查询仅记录选择，待用户输入后生效。
  const onTypeChange = (t: SearchType) => {
    setType(t);
    if (query.trim()) navigate(query, t);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ====================== 搜索输入框 ====================== */}
      <form onSubmit={onSearch} className="relative w-full" role="search">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E8E]">
          {/* 放大镜图标 */}
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索产品与新闻…"
          aria-label="搜索产品与新闻"
          className={cn(
            "h-12 w-full rounded-xl border border-[#EEEEEE] bg-white pl-12 pr-4",
            "text-[15px] text-[#171A20] placeholder:text-[#8E8E8E] outline-none",
            "transition-colors duration-300 focus:border-[#3E6AE1]"
          )}
        />
      </form>

      {/* ====================== 类型切换 Tabs ====================== */}
      <div
        className="flex items-center gap-1 rounded-xl bg-[#F4F4F4] p-1"
        role="tablist"
        aria-label="搜索类型"
      >
        {TABS.map((tab) => {
          const active = type === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTypeChange(tab.value)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-300",
                active
                  ? "bg-white text-[#171A20] shadow-sm"
                  : "text-[#5C5E62] hover:text-[#171A20]"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
