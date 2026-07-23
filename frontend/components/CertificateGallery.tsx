"use client";

/**
 * 文件：components/CertificateGallery.tsx（资质证书画廊 + Lightbox）
 * 职责：以响应式图标格栅展示认证证书缩略图；点击任意证书即弹出全屏透明遮罩层（Lightbox），
 *       展示该证书的高清大图。支持 Esc 关闭、点击空白关闭、左右方向键切换、背景滚动锁定。
 * 是否为客户端组件：是（需要 onClick / 键盘事件 / 动态遮罩状态）。
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";

/** 单张证书的数据结构，与 content-data.ts 中 certificationImages 的字段保持一致 */
interface CertItem {
  /** 证书代号（文件名前缀），作为卡片主标题 */
  title: string;
  /** 证书全称 / 适用范围 */
  description: string;
  /** 图片路径（public 下） */
  src: string;
}

export default function CertificateGallery({ items }: { items: readonly CertItem[] }) {
  // 当前在 Lightbox 中展示的证书下标；null 表示遮罩层关闭
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const close = useCallback(() => setActiveIndex(null), []);

  // 键盘交互 + 背景滚动锁定：仅在 Lightbox 打开时生效
  useEffect(() => {
    if (activeIndex === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        setActiveIndex((i) => (i === null ? i : (i + 1) % items.length));
      } else if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    // 打开遮罩时锁定页面滚动，避免背景跟着滚
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeIndex, close, items.length]);

  const active = activeIndex !== null ? items[activeIndex] : null;

  return (
    <>
      {/* 图标格栅：每张证书缩略图，点击弹出 Lightbox */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((cert, i) => (
          <button
            key={cert.src}
            type="button"
            onClick={() => setActiveIndex(i)}
            aria-label={`查看 ${cert.title} 证书高清大图`}
            className="group flex flex-col overflow-hidden border border-[#EEEEEE] bg-white text-left transition-all hover:border-[#d4343e] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4343e]"
            style={{ borderRadius: "12px", transitionDuration: "0.33s" }}
          >
            {/* 缩略图区域：固定高度、白底、图片完整居中 */}
            <div className="relative h-40 bg-white p-3">
              <Image
                src={cert.src}
                alt={`${cert.title} 认证证书`}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                className="object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            {/* 标题 + 说明 */}
            <div className="border-t border-[#F2F2F2] px-3 pb-3 pt-2">
              <div className="text-sm font-semibold text-gray-900">{cert.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "#5C5E62" }}>
                {cert.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox 全屏透明遮罩层 */}
      {active && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${active.title} 证书高清大图`}
          onClick={close}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
        >
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6 sm:top-6"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* 高清大图（点击图片本身不关闭，仅点击外部遮罩关闭） */}
          <figure
            className="flex max-h-[82vh] w-full max-w-5xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-[78vh] w-full">
              <Image
                src={active.src}
                alt={`${active.title} 认证证书高清大图`}
                fill
                sizes="100vw"
                className="object-contain rounded-lg"
                priority
              />
            </div>
            <figcaption className="mt-4 text-center text-white">
              <div className="text-base font-semibold">{active.title}</div>
              <div className="mt-1 text-sm text-white/70">{active.description}</div>
            </figcaption>
          </figure>

          {/* 左右切换（环形） */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length));
            }}
            aria-label="上一张证书"
            className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((i) => (i === null ? i : (i + 1) % items.length));
            }}
            aria-label="下一张证书"
            className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
