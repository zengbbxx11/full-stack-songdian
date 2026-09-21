"use client";
/*
 * 媒体缩略块：媒体页网格与媒体选择器共用。
 * - 图片：<img loading="lazy">（媒体库素材是运行时上传的任意尺寸，原生 img 优于优化代理）
 * - 视频：IntersectionObserver 懒挂载 <video preload="metadata" muted playsInline>，由浏览器
 *   取首帧（不引入 ffmpeg）；只有瓦片进入视口才挂载，避免一页 N 个视频各发一次 metadata 请求。
 *   视频块左下角显示「视频」角标；传入 onOpenPreview 时中央显示播放按钮（点击预览，不触发选中）。
 *
 * ⚠️ 使用约束：仅用于客户端渲染的网格（媒体页/选择器都经 SWR 取数）。
 * "是否支持 IntersectionObserver" 在渲染期判定，若把它用到有服务端输出的列表，
 * SSR 分支与客户端首渲会不一致（hydration mismatch）。
 */
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from "react";

import { resolveMediaUrl } from "@/lib/api-client";
import { isVideoUrl } from "./types";

interface MediaThumbProps {
  url: string;
  title: string;
  /** 容器尺寸类名（如 aspect-square / h-20 w-20），默认铺满父级 */
  className?: string;
  /** 视频点击播放（可选）：提供后视频块中央显示播放按钮 */
  onOpenPreview?: () => void;
}

export default function MediaThumb({ url, title, className = "h-full w-full", onOpenPreview }: MediaThumbProps) {
  const isVideo = isVideoUrl(url);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // IntersectionObserver 在渲染期判断（避免在 effect 里同步 setState）；
  // 极少数不支持的直接挂载（此时数量少，行为退化为"全部预取"）。
  const supportsObserver = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    if (!isVideo || !supportsObserver || inView) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // 提前 200px 预挂载，滚动到时首帧多半已就绪
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVideo, supportsObserver, inView]);

  // 视频瓦片是否真正挂载 <video>（进入视口才挂，一页 N 个视频不会各发一次 metadata 请求）
  const mountVideo = !supportsObserver || inView;

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-gray-100 dark:bg-gray-800 ${className}`}>
      {isVideo ? (
        <>
          {mountVideo ? (
            <video src={resolveMediaUrl(url)} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={title} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300 dark:text-gray-600">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="opacity-60"><rect x="3" y="6" width="12" height="12" rx="2" /><path d="m15 10 5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          )}
          {/* 角标放左下：左上角是媒体页的选中复选框、右上角是选择器的勾选标记，避免重叠 */}
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">视频</span>
          {onOpenPreview && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPreview(); }}
              aria-label={`预览 ${title}`}
              className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/25"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" /></svg>
              </span>
            </button>
          )}
        </>
      ) : (
        <img src={resolveMediaUrl(url)} alt={title} className="h-full w-full object-cover" loading="lazy" />
      )}
    </div>
  );
}
