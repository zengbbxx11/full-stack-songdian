"use client";

// 客户端组件：framer-motion 下划线入场动画依赖浏览器
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * SectionHeading — 带动画下划线的区块标题
 * ------------------------------------------------------------------
 * 下划线在进入视口时从中心向两侧展开（scaleX 0 → 1）。
 * 尊重 prefers-reduced-motion：开启时直接显示终态。
 */

interface SectionHeadingProps {
  children: ReactNode;
  align?: "center" | "left";
  /** 作用在包裹层上的额外类名（如间距 mb-14） */
  className?: string;
  /** 下划线颜色，默认品牌红 */
  accent?: string;
}

export default function SectionHeading({
  children,
  align = "center",
  className = "",
  accent = "#d4343e",
}: SectionHeadingProps) {
  const reduce = useReducedMotion();

  return (
    <div className={`${align === "center" ? "text-center" : "text-left"} ${className}`}>
      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight inline-block">
        {children}
      </h2>
      <motion.div
        className="mx-auto mt-3 h-[3px] rounded-full"
        style={{
          width: align === "center" ? "64px" : "56px",
          background: accent,
          transformOrigin: "center",
        }}
        initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
        whileInView={reduce ? undefined : { scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        aria-hidden
      />
    </div>
  );
}
