"use client";

/**
 * components/ExhibitionMarquee.tsx —— 参展展会横向自动滚动墙 + 点击放大
 * ------------------------------------------------------------------
 * - 图片由父级（首页 Server Component）从 public/Exhibitions 动态传入。
 * - 无缝循环自动滚动，悬停暂停。
 * - **点击图片**弹出全屏 lightbox 查看大图，支持 ESC / 点击遮罩关闭。
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Pause, Play, X } from "lucide-react";
import type { Exhibition } from "@/lib/exhibitions";

interface ExhibitionMarqueeProps {
  items: Exhibition[];
}

export default function ExhibitionMarquee({ items }: ExhibitionMarqueeProps) {
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 按 ESC 关闭 lightbox
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
    }
    document.addEventListener("keydown", onKeyDown);
    // 锁定 body 滚动
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxIndex, closeLightbox]);

  if (items.length === 0) return null;

  const loop = [...items, ...items];
  const currentItem = lightboxIndex !== null ? items[lightboxIndex] : null;

  return (
    <div
      className="group/region relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Exhibitions we attend, auto-scrolling logo wall"
    >
      {/* 暂停/播放 + 提示 */}
      <div className="absolute -top-12 right-0 z-20 flex items-center gap-2">
        <span className="hidden sm:inline text-xs text-[#5C5E62]">Click to enlarge</span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
          aria-pressed={paused}
          className="inline-flex h-9 w-9 items-center justify-center rounded border border-[#EEEEEE] bg-white text-[#393C41] transition-colors hover:text-[#d4343e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4343e]"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex w-max animate-marquee"
          style={{ animationPlayState: paused ? "paused" : "running" }}
        >
          {loop.map((item, i) => {
            const realIndex = i % items.length;
            return (
              <figure
                key={i}
                className="group/fig w-64 shrink-0 pr-6"
                aria-hidden={i >= items.length}
              >
                {/* 点击打开 lightbox */}
                <button
                  type="button"
                  onClick={() => setLightboxIndex(realIndex)}
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#EEEEEE] bg-white cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4343e] focus-visible:ring-offset-2"
                  aria-label={`View ${item.name} exhibition photo in full size`}
                >
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="256px"
                    className="object-contain p-4 transition-transform duration-300 ease-out group-hover/fig:scale-[1.03]"
                  />
                </button>
                <figcaption className="mt-3 text-center">
                  <p className="truncate text-sm font-semibold text-[#171A20]" title={item.name}>
                    {item.name}
                  </p>
                  {item.year && (
                    <p className="mt-0.5 text-xs font-medium" style={{ color: "#d4343e" }}>
                      {item.year}
                    </p>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      {/* ====================== Lightbox 全屏查看 ====================== */}
      {currentItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${currentItem.name} exhibition photo`}
        >
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* 大图区域 */}
          <div
            className="relative w-[90vw] h-[80vh] max-w-6xl flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full">
              <Image
                src={currentItem.src}
                alt={currentItem.alt}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </div>
            {/* 底部信息 */}
            <div className="text-center">
              <p className="text-base font-semibold text-white">{currentItem.name}</p>
              {currentItem.year && (
                <p className="mt-1 text-sm text-white/70">{currentItem.year}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
