/**
 * InstantSearch — 即时产品搜索下拉建议（client component）。
 *
 * 改动要点：
 * - 搜索框缩小（h-8 w-44）
 * - 只搜产品（type=product），不搜新闻
 * - 下拉结果只显示产品主图 + 型号（SKU 优先、title 兜底），英文呈现
 * - 图片加载失败自动显示占位符
 */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { search, type SearchResultItem } from "@/lib/api/search";

const DEBOUNCE_MS = 300;

/** 取型号显示文字：优先 SKU，否则用 title */
function modelLabel(item: SearchResultItem): string {
  return item.sku || item.title;
}

export default function InstantSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reqIdRef = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 点击外部关闭
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // 卸载清理
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // 搜索（竞态保护）
  const runSearch = useCallback(async (q: string) => {
    const reqId = ++reqIdRef.current;
    try {
      const res = await search(q, { type: "product", pageSize: 5 });
      if (reqId !== reqIdRef.current) return;
      setItems(res.items);
      setError(false);
    } catch {
      if (reqId !== reqIdRef.current) return;
      setItems([]);
      setError(true);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(false), 2500);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = value.trim();
    if (!q) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      setItems([]);
      setLoading(false);
      setError(false);
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, DEBOUNCE_MS);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (activeIndex >= 0 && items[activeIndex]) {
      router.push(items[activeIndex].url);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const hasQuery = query.trim().length > 0;
  const showDropdown = open && hasQuery;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <form onSubmit={handleSubmit} role="search">
        <div className="relative">
          {/* 搜索图标 */}
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8E8E8E]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search products"
            aria-label="Search products"
            autoComplete="off"
            className="h-8 w-44 rounded-md border border-gray-200 bg-white pl-8 pr-2.5 text-xs text-[#171A20] outline-none transition-colors placeholder:text-[#8E8E8E] focus:border-[#3E6AE1]"
          />
        </div>
      </form>

      {/* 下拉浮层 */}
      {showDropdown && (
        <div className="absolute left-0 top-full z-[60] mt-1.5 min-w-48 w-max max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#EEEEEE] bg-white shadow-[0_8px_28px_rgba(0,0,0,0.10)]">
          {/* 加载态 */}
          {loading && (
            <div className="py-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-[#EEEEEE]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-[#EEEEEE]" />
                </div>
              ))}
            </div>
          )}

          {/* 错误态 */}
          {!loading && error && (
            <div className="px-4 py-6 text-center text-sm text-[#8E8E8E]">Search unavailable</div>
          )}

          {/* 空态 */}
          {!loading && !error && items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[#5C5E62]">No products found</div>
          )}

          {/* 结果列表：只显示主图 + 型号 */}
          {!loading && !error && items.length > 0 && (
            <ul className="max-h-[50vh] overflow-y-auto py-1">
              {items.map((item, i) => {
                const isActive = i === activeIndex;
                return (
                  <li key={`product-${item.id}`}>
                    <Link
                      href={item.url}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                        isActive ? "bg-[#F4F4F4]" : "hover:bg-[#F4F4F4]"
                      }`}
                    >
                      {/* 产品缩略图（加载失败自动显示占位） */}
                      <Thumbnail src={item.coverImage} alt={item.title} />
                      {/* 型号 */}
                      <span className="truncate text-sm font-medium text-[#171A20]">
                        {modelLabel(item)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 缩略图组件：图片加载失败时显示占位符。
 * 使用原生 img 的 onError 回调切换状态（避免 next/image 对远程图额外限制）。
 */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  // src 变化时重置 failed 状态
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gradient-to-br from-[#EEF1F5] to-[#E3E6EA]">
        <svg
          className="h-4 w-4 text-[#B0B1B3]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded object-cover"
    />
  );
}
