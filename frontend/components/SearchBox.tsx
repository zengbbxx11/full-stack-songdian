/**
 * 站点搜索框（客户端组件）。
 * 提交后将用户导航至 /search?q=...，由服务端搜索页执行后端联合搜索。
 * 作为纯客户端组件，避免引入 useSearchParams 造成的静态渲染 Suspense 边界问题。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={onSubmit} className={className} role="search">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        aria-label="Search products and news"
        className="h-9 w-40 rounded border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-[#3E6AE1]"
      />
    </form>
  );
}
