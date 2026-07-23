"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/**
 * ProductCard 组件的 Props。
 */
interface ProductCardProps {
  /** 产品数据，包括 slug、name、image、shortDescription 和 categories */
  product: ProductSummary;
}

/**
 * 产品卡片 — hover 时边框变红 + 微阴影提升 + 图片微缩放
 *
 * - 默认：淡边框 #EEEEEE，无阴影
 * - Hover：品牌红边框 #d4343e + 轻微阴影 + 图片 scale(1.03)
 * - CTA 按钮：bg #3E6AE1，hover 加深
 */
export default function ProductCard({ product }: ProductCardProps) {
  const tags = product.tags || [];
  const category = product.categories[0]?.name || "";
  // 图片加载失败时切换到占位图标（远程文件 404 等情况）
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="group h-full flex flex-col bg-white overflow-hidden border border-[#EEEEEE] hover:border-[#d4343e] hover:shadow-lg transition-all"
      style={{ borderRadius: "12px", transitionDuration: "0.3s" }}
    >
      {/* ====================== 图片区域 ====================== */}
      <Link
        href={`/products/${product.slug}`}
        className="block relative aspect-square shrink-0 bg-gray-50 overflow-hidden"
      >
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.imageAlt || product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-[1.03]"
            style={{ transitionDuration: "0.3s" }}
            onError={() => setImgError(true)}
          />
        ) : (
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
        )}
      </Link>

      {/* ====================== 信息区域 ====================== */}
      <div className="flex flex-col flex-1 p-4">
        <Link href={`/products/${product.slug}`} className="flex-1">
          <h3 className="text-[14px] font-semibold text-gray-900 group-hover:text-[#d4343e] line-clamp-2 leading-snug transition-colors" style={{ transitionDuration: "0.3s" }}>
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

        {/* ====================== CTA ====================== */}
        <Link
          href={`/products/${product.slug}`}
          className="flex items-center justify-center w-full mt-3 h-[34px] text-xs font-medium text-white rounded bg-[#3E6AE1] hover:bg-[#3561CC] transition-colors"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "4px",
            transitionDuration: "0.33s",
          }}
        >
          View Details
        </Link>
      </div>
    </div>
  );
}
