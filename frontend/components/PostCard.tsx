"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { PostSummary } from "@/lib/types";

/**
 * PostCard 组件的 Props。
 */
interface PostCardProps {
  /** 博客文章摘要数据 */
  post: PostSummary;
  /** 是否显示作者（默认显示）；首页 Latest News 区传 false 隐藏 */
  showAuthor?: boolean;
}

/**
 * 新闻文章卡片 — hover 蓝框 + 轻微浮起 + 图片亮度变化
 *
 * - 默认：淡边框 #EEEEEE，无阴影
 * - Hover：Electric Blue 边框 + shadow-sm + 图片 brightness(1.05)
 * - 标题 hover 变蓝
 */
export default function PostCard({ post, showAuthor = true }: PostCardProps) {
  const [imgError, setImgError] = useState(false);
  return (
    <Link
      href={`/news/${post.slug}`}
      className="group flex flex-col h-full bg-white overflow-hidden border border-[#EEEEEE] hover:border-[#3E6AE1] hover:shadow-sm transition-all"
      style={{ borderRadius: "12px", transitionDuration: "0.3s" }}
    >
      {/* ====================== 图片区域 ====================== */}
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
        {post.featuredImage && !imgError ? (
          <Image
            src={post.featuredImage}
            alt={post.featuredImageAlt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-all brightness-[1.06] group-hover:brightness-[1.12]"
            style={{ transitionDuration: "0.3s" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
        )}

        {post.categories.length > 0 && (
          <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm text-xs font-medium text-gray-700 border border-gray-200/50">
            {post.categories[0].name}
          </span>
        )}
      </div>

      {/* ====================== 内容区域 ====================== */}
      <div className="flex flex-1 flex-col p-4 md:p-5">
        <h3 className="text-base md:text-lg font-semibold text-gray-900 group-hover:text-[#3E6AE1] line-clamp-2 leading-snug mb-2 transition-colors" style={{ transitionDuration: "0.3s" }}>
          {post.title}
        </h3>

        <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed mb-3" style={{ color: "#5C5E62" }}>
          {post.excerpt}
        </p>

        {/* mt-auto：无论标题/摘要几行，时间行始终贴卡片底部，保证等高对齐 */}
        <div className="flex items-center gap-3 text-xs md:text-sm text-gray-400 mt-auto pt-1">
          <span>{post.date}</span>
          {showAuthor && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>{post.author}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
