import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import SafeImage from "@/components/SafeImage";
import { ArrowRight } from "lucide-react";
import { productPath } from "@/lib/product-url";

/**
 * ProductCard 组件的 Props。
 */
interface ProductCardProps {
  /** 产品数据，包括 slug、name、image、shortDescription 和 categories */
  product: ProductSummary;
  /** Preload only the single above-the-fold LCP candidate. */
  preload?: boolean;
}

// 图片加载失败 / 无图时的占位（相机图标）
const imageFallback = (
  <div className="absolute inset-0 flex items-center justify-center text-gray-300">
    <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  </div>
);

/**
 * 产品卡片 — hover 时边框变红 + 微阴影提升 + 图片微缩放
 *
 * 说明：本组件为服务端组件（RSC）。图片加载失败占位由 SafeImage 客户端子组件处理，
 * 因此无需为了 onError 状态把整个卡片标记为 "use client"，可减少 hydration 体积。
 *
 * - 默认：淡边框 #EEEEEE，无阴影
 * - Hover：品牌红边框 #d4343e + 轻微阴影 + 图片 scale(1.03)
 * - CTA：幽灵文字链 "View Details →"，默认 Graphite 灰、卡片 hover 变红 #d4343e + 箭头滑入（蓝色实心按钮已弃用，避免与红 hover 语言撞色且消除重复色块）
 */
export default function ProductCard({ product, preload = false }: ProductCardProps) {
  const tags = product.tags || [];

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/8 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-black/20 hover:shadow-[0_24px_60px_rgba(17,19,22,0.1)] focus-within:border-[var(--accent)]/60 focus-within:shadow-[0_18px_45px_rgba(17,19,22,0.08)] active:translate-y-0 active:shadow-sm">
      {/* 图片区域 */}
      <Link
        href={productPath(product)}
        className="relative block aspect-[4/3] shrink-0 overflow-hidden bg-[#f2f3f4] md:aspect-square"
      >
        {product.image ? (
          <SafeImage
            src={product.image}
            alt={product.imageAlt || product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            preload={preload}
            className="object-contain transition-transform group-hover:scale-[1.04]"
            style={{ transitionDuration: "0.3s" }}
            fallback={imageFallback}
          />
        ) : (
          imageFallback
        )}
      </Link>

      {/* 信息区域 */}
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <Link href={productPath(product)} className="flex-1 rounded-sm focus-visible:outline-offset-4">
          {product.categories[0] && <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8e94]">{product.categories[0].name}</p>}
          <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.02em] text-[var(--foreground)] transition-colors duration-300 group-hover:text-[var(--accent)] md:text-[18px]">
            {product.name}
          </h3>
          {/* 产品标签 —— 最多展示 4 个，沿用 Tesla 设计语言（Light Ash 底 / Pewter 字、无阴影） */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.slice(0, 4).map((tag) => (
                <Badge variant="secondary" key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </Link>

        {/* CTA —— 幽灵文字链：默认 Graphite 灰，卡片 hover 变红 + 箭头滑入 */}
        <Link
          href={productPath(product)}
          aria-label={`View details of ${product.name}`}
          className="mt-3 inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-sm text-xs font-semibold uppercase tracking-[0.08em] text-[var(--graphite)] transition-colors duration-300 group-hover:text-[var(--accent)] active:text-[var(--accent-hover)]"
        >
          <span>View Details</span>
          <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </Link>
      </div>
    </article>
  );
}
