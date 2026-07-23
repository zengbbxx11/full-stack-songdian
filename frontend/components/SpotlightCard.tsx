"use client";

/**
 * SpotlightCard —— 鼠标跟随聚光灯 + 选中态高亮包装组件
 * ------------------------------------------------------------------
 * 给"鼠标选中"更生动的视觉反馈，专用于 News 页新闻卡片：
 *  - 鼠标在卡片上移动时，内部渲染一个跟随鼠标位置的径向蓝色光晕；
 *  - hover 时叠加一圈 inset 蓝光环（选中/聚焦感）+ 卡片轻微上浮；
 *  - 尊重系统"减少动态效果"偏好：开启时仅保留边框高亮，关闭光晕与位移。
 *
 * 设计取自品牌色 Electric Blue (#3E6AE1)，与全站 hover 体系一致。
 */

import { useRef, useState, useEffect, type CSSProperties, type ReactNode } from "react";

interface SpotlightCardProps {
  /** 被包裹的卡片内容（通常是一个 <Link> 整卡） */
  children: ReactNode;
  /** 透传到外层包裹容器的类名（如网格中等高用 h-full） */
  className?: string;
  /** 聚光灯 RGB 分量，默认品牌蓝 62,106,225 */
  spotlightRgb?: string;
}

export default function SpotlightCard({
  children,
  className = "",
  spotlightRgb = "62,106,225",
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // 鼠标移动时记录相对卡片左上角的坐标，驱动光晕跟随
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (prefersReduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const spotlightStyle: CSSProperties = {
    background: `radial-gradient(240px circle at ${pos.x}px ${pos.y}px, rgba(${spotlightRgb}, 0.15), transparent 70%)`,
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`group relative rounded-[12px] transition-transform duration-300 will-change-transform ${
        prefersReduced ? "" : "hover:-translate-y-0.5"
      } ${className}`}
    >
      {/* 鼠标跟随聚光灯（减少动态时整体不渲染） */}
      {!prefersReduced && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[12px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={spotlightStyle}
        />
      )}

      {/* 选中态 inset 蓝光环 —— 鼠标"选中"卡片时的聚焦框 */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-10 rounded-[12px] opacity-0 ${
          prefersReduced ? "" : "transition-opacity duration-300 group-hover:opacity-100"
        }`}
        style={{ boxShadow: "inset 0 0 0 1.5px rgba(62,106,225,0.55)" }}
      />

      {children}
    </div>
  );
}
