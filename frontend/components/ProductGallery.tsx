"use client";

// 客户端组件：缩略图点击切换右侧大图
import { useState, useCallback } from "react";
import Image from "next/image";

/**
 * ProductGallery — 产品图片 + 竖排缩略图相册
 * ------------------------------------------------------------------
 * 左侧竖排缩略图（产品图 + 最多 3 张相册），右侧大图。
 * 点击缩略图切换，选中高亮红框。图片 404 时自动隐藏。
 */
interface ProductGalleryProps {
  /** 产品主图 */
  mainImage: string;
  /** 主图 alt */
  mainAlt: string;
  /** 相册图片（不含主图） */
  gallery: { id: number; src: string; alt?: string }[];
}

export default function ProductGallery({
  mainImage,
  mainAlt,
  gallery,
}: ProductGalleryProps) {
  // 当前展示的大图地址，默认取主图
  const [selected, setSelected] = useState(mainImage);
  // 记录加载失败的图片 id（包括主图 id=-1），不渲染失败的缩略图
  const [brokenIds, setBrokenIds] = useState<Set<number>>(new Set());
  // 主图是否加载失败
  const [mainImgError, setMainImgError] = useState(false);

  const markBroken = useCallback((id: number) => {
    setBrokenIds((prev) => new Set(prev).add(id));
  }, []);

  // 缩略图列表：产品图 + 最多 3 张相册图，过滤掉 404 的
  const thumbs = [
    { id: -1, src: mainImage, alt: mainAlt },
    ...gallery.slice(0, 3),
  ].filter((img) => !brokenIds.has(img.id));

  return (
    <div className="flex gap-3 md:gap-4">
      {/* 左侧缩略图列 */}
      <div className="flex flex-col gap-2 w-16 md:w-20 shrink-0">
        {thumbs.map((img) => (
          <button
            key={img.id}
            // 点击缩略图切换右侧大图
            onClick={() => setSelected(img.src)}
            className={`relative aspect-square overflow-hidden bg-gray-50 border-2 transition-colors cursor-pointer ${
              selected === img.src
                ? "border-[#d4343e]"
                : "border-[#EEEEEE] hover:border-gray-400"
            }`}
            style={{ borderRadius: "8px" }}
          >
            <Image
              src={img.src}
              alt={img.alt || mainAlt}
              fill
              sizes="80px"
              className="object-cover"
              onError={() => markBroken(img.id)}
            />
          </button>
        ))}
      </div>

      {/* 右侧大图 */}
      <div className="flex-1">
        <div
          className="relative aspect-square overflow-hidden bg-gray-50 border border-[#EEEEEE]"
          style={{ borderRadius: "12px" }}
        >
          {mainImgError ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300">
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
          ) : (
            <Image
              src={selected}
              alt={mainAlt}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              priority
              onError={() => setMainImgError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
