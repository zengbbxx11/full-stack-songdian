"use client";

/**
 * 文件：components/CertificateGallery.tsx（资质证书画廊 + Lightbox）
 * 职责：以响应式图标格栅展示认证证书缩略图；点击任意证书即弹出全屏透明遮罩层（Lightbox），
 *       展示该证书的高清大图。支持 Esc 关闭、点击空白关闭、左右方向键切换、背景滚动锁定。
 * 是否为客户端组件：是（需要 onClick / 键盘事件 / 动态遮罩状态）。
 */

import { useEffect, useRef, useState, useCallback } from "react";
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

  const isOpen = activeIndex !== null;
  // 弹层容器（用于 Tab 焦点陷阱）与打开前的触发元素（关闭后还原焦点）
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setActiveIndex(null), []);

  // 打开时移入焦点，关闭时还原；随后处理键盘交互 + 背景滚动锁定
  useEffect(() => {
    if (!isOpen) return;

    // 记录触发元素并把焦点移入弹层，避免焦点留在被遮罩的背景上
    const opener = openerRef.current;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        setActiveIndex((i) => (i === null ? i : (i + 1) % items.length));
      } else if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : (i - 1 + items.length) % items.length));
      } else if (e.key === "Tab") {
        // 焦点陷阱：把 Tab 循环限制在弹层内，不让焦点跑到被遮罩的页面元素上
        const focusables = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const focused = document.activeElement;
        if (e.shiftKey && (focused === first || !dialogRef.current?.contains(focused))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && focused === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    // 打开遮罩时锁定页面滚动，避免背景跟着滚
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      // 还原焦点到触发键，保证键盘用户不会丢失当前上下文
      opener?.focus();
    };
  }, [isOpen, close, items.length]);

  const active = activeIndex !== null ? items[activeIndex] : null;

  return (
    <>
      {/* 图标格栅：每张证书缩略图，点击弹出 Lightbox */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((cert, i) => (
          <button
            key={cert.src}
            type="button"
            onClick={() => {
              // 记录触发元素，弹层关闭后把焦点还原回来
              openerRef.current = document.activeElement as HTMLElement | null;
              setActiveIndex(i);
            }}
            aria-label={`View ${cert.title} certificate in full size`}
            className="group flex touch-manipulation flex-col overflow-hidden border border-[var(--border)] bg-white text-left transition-all hover:border-[var(--accent)] hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ borderRadius: "12px", transitionDuration: "0.33s" }}
          >
            {/* 缩略图区域：固定高度、白底、图片完整居中 */}
            <div className="relative h-40 bg-white p-3">
              <Image
                src={cert.src}
                alt={`${cert.title} 认证证书`}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                className="object-contain transition-transform duration-300 group-hover:scale-105 group-focus-visible:scale-105"
              />
            </div>
            {/* 标题 + 说明 */}
            <div className="border-t border-[#F2F2F2] px-3 pb-3 pt-2">
              <div className="text-sm font-semibold text-gray-900">{cert.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--muted-foreground)" }}>
                {cert.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox 全屏透明遮罩层 */}
      {active && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${active.title} certificate preview`}
          onClick={close}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
        >
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={close}
            aria-label="Close certificate preview"
            className="absolute right-4 top-4 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:right-6 sm:top-6"
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
                preload
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
            aria-label="Previous certificate"
            className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:left-6"
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
            aria-label="Next certificate"
            className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:right-6"
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
