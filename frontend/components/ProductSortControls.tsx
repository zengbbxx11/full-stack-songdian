"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "@/lib/sort-options";

/**
 * ProductSortControls — 列表排序下拉控件
 * 通过 URL searchParams 传递 ?sort=xxx，服务端组件读取后传给 API。
 * @param basePath URL 基础路径（如 "/products" 或 "/news"）
 */
export default function ProductSortControls({
  className,
  basePath = "/products",
}: {
  className?: string;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("sort") || "default";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSort = e.target.value;
      const params = new URLSearchParams(searchParams.toString());
      if (newSort === "default") {
        params.delete("sort");
      } else {
        params.set("sort", newSort);
      }
      params.delete("page"); // 切换排序时回到第 1 页
      router.push(`${basePath}?${params.toString()}`);
    },
    [router, searchParams, basePath],
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor="product-sort" className="text-sm text-[#5C5E62] shrink-0">Sort:</label>
      <select
        id="product-sort"
        value={active}
        onChange={handleChange}
        className="text-sm border border-[#EEEEEE] rounded px-3 py-2 bg-white text-[#393C41] cursor-pointer focus:outline-none focus:border-[#3E6AE1] transition-colors"
        style={{ borderRadius: "4px" }}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
