import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { BreadcrumbItem } from "@/lib/types";
import { safeJsonLd } from "@/lib/seo";

/**
 * Breadcrumbs 组件的 Props。
 */
interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  variant?: "light" | "dark";
}

/**
 * Tesla 风格面包屑导航组件（服务端组件）。
 *
 * - 当前页：Pewter #5C5E62
 * - 分隔符：#D0D1D2
 * - 链接：Graphite #393C41，hover Carbon Dark #171A20
 * - 使用 CSS 变量实现 hover 效果，无需 JavaScript 事件处理器
 */
export default function Breadcrumbs({
  items,
  variant = "light",
}: BreadcrumbsProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: item.href
        ? `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}${item.href}`
        : undefined,
    })),
  };

  const isDark = variant === "dark";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
      />
      <nav
        aria-label="Breadcrumb"
        className={`inline-flex max-w-full items-center gap-1 overflow-hidden rounded-full border px-2 py-1.5 text-sm shadow-sm backdrop-blur-sm ${
          isDark
            ? "border-white/10 bg-white/[0.06] text-white/65"
            : "border-black/[0.08] bg-white/90 text-[#5C5E62]"
        }`}
      >
        {items.map((item, i) => (
          <span
            key={item.href || item.label}
            className={`flex min-w-0 items-center gap-1 ${i === items.length - 1 ? "overflow-hidden" : "shrink-0"}`}
          >
            {i > 0 && (
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-white/25" : "text-black/25"}`} />
            )}

            {item.href ? (
              <Link
                href={item.href}
                aria-label={i === 0 ? "Home" : undefined}
                className={`inline-flex h-7 items-center rounded-full px-2 font-medium transition-colors ${
                  isDark
                    ? "hover:bg-white/10 hover:text-white"
                    : "hover:bg-[#f5f6f7] hover:text-[#d4343e]"
                }`}
              >
                {i === 0 ? <Home className="h-3.5 w-3.5" aria-hidden="true" /> : item.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                className={`truncate rounded-full px-2 py-1 font-semibold ${isDark ? "bg-white/10 text-white" : "bg-[#f5f6f7] text-[#171A20]"}`}
              >
                {item.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
