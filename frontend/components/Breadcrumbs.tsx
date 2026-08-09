"use client";

// 客户端组件：通过内联 onMouseEnter/onMouseLeave 事件处理器实现 hover 颜色切换
import Link from "next/link";
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

  // Tesla 颜色变体
  const linkColor = variant === "dark" ? "#B0B1B3" : "#393C41";
  const linkHoverColor = variant === "dark" ? "#FFFFFF" : "#171A20";
  const activeColor = variant === "dark" ? "#8E8E8E" : "#5C5E62";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }}
      />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-[13px] flex-wrap"
      >
        {items.map((item, i) => (
          <span key={item.href || item.label} className="flex items-center gap-2">
            {i > 0 && (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                style={{ color: variant === "dark" ? "#8E8E8E" : "#D0D1D2" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}

            {item.href ? (
              <Link
                href={item.href}
                style={{
                  color: linkColor,
                  transition: "color 0.33s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = linkHoverColor;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = linkColor;
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: activeColor, fontWeight: 500 }}>
                {item.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
