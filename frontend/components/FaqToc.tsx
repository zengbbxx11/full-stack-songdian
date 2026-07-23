"use client";

/**
 * FaqToc — FAQ 分类锚点导航（粘性目录）
 * ------------------------------------------------------------------
 * 桌面端：左侧粘性侧栏，按分类列出锚点，滚动时高亮当前所在分区。
 * 移动端：顶部粘性横向滚动胶囊条，同样支持点击直达。
 * 点击任意分类平滑滚动到对应 <section>，并同步 URL hash（不触发额外跳转）。
 *
 * 图标映射集中在本文件，供 FAQ 页标题复用（CATEGORY_ICONS 导出）。
 */

import { useEffect, useState, type MouseEvent } from "react";
import {
  Award,
  ShieldCheck,
  Truck,
  LifeBuoy,
  Handshake,
  SlidersHorizontal,
  ListTree,
  type LucideIcon,
} from "lucide-react";

/** 分类名 → Lucide 图标（与 FAQ 页标题图标保持一致） */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Capabilities & Certification": Award,
  "Product Quality": ShieldCheck,
  Delivery: Truck,
  "After-Sales Service": LifeBuoy,
  Cooperation: Handshake,
  "Customization Services": SlidersHorizontal,
};

export interface FaqNavItem {
  id: string;
  label: string;
  count: number;
}

export default function FaqToc({ categories }: { categories: FaqNavItem[] }) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? "");

  // 滚动监听：高亮视口顶部附近的分区
  useEffect(() => {
    const sections = categories
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((best, cur) =>
          cur.boundingClientRect.top < best.boundingClientRect.top ? cur : best
        );
        setActiveId(topmost.target.id);
      },
      // 顶部留出固定导航栏高度，底部 -65% 让"当前分区"判定更靠近视口上方
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  const goTo = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav
      aria-label="FAQ categories"
      className="rounded-xl border border-[#EEEEEE] bg-white p-4 lg:p-5"
    >
      <p className="flex items-center gap-2 px-1 mb-3 text-xs font-semibold uppercase tracking-wider text-[#5C5E62]">
        <ListTree className="w-4 h-4" />
        Browse by topic
      </p>
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible pb-1 lg:pb-0">
        {categories.map((c) => {
          const Icon = CATEGORY_ICONS[c.label] ?? ListTree;
          const isActive = activeId === c.id;
          return (
            <li key={c.id} className="shrink-0">
              <a
                href={`#${c.id}`}
                onClick={(e) => goTo(e, c.id)}
                aria-current={isActive ? "true" : undefined}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap lg:whitespace-normal transition-colors ${
                  isActive
                    ? "border-[#d4343e] bg-[#FDECEC] text-[#d4343e]"
                    : "border-transparent text-[#393C41] hover:bg-[#F4F4F4] hover:text-[#d4343e]"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="lg:flex-1 lg:min-w-0 lg:truncate">{c.label}</span>
                <span
                  className={`ml-2 hidden lg:inline text-xs ${
                    isActive ? "text-[#d4343e]" : "text-[#8E8E8E]"
                  }`}
                >
                  {c.count}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
