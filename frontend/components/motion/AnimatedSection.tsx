"use client";

/*
 * AnimatedSection —— 滚动触发的入场动画包装组件（项目自定义）
 * 基于 framer-motion 的 whileInView，当元素滚动进入视口时淡入并滑入。
 * - 通过 direction 控制滑入方向（上/下/左/右/无），delay 支持错位动画。
 * - 尊重系统“减少动态效果”偏好：开启时直接无动画渲染，保证可访问性。
 * - viewport={{ once: true }} 保证动画仅触发一次。
 */

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * AnimatedSection 包装组件的 Props。
 */
interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  /** 动画延迟（秒），支持错位效果。默认：0 */
  delay?: number;
  /** 入场动画方向。默认："up" */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** 触发动画的视口边距（例如 "-100px"）。默认："-50px" */
  margin?: string;
}

/**
 * AnimatedSection — 滚动触发的显示动画包装器。
 * ------------------------------------------------------------------
 * 将任何内容包裹在 framer-motion div 中，当滚动到视口中时
 * 内容会淡入并滑入。使用 `whileInView` 实现仅触发一次的行为。
 *
 * 尊重 `prefers-reduced-motion` — 偏好减少动画的用户
 * 会立即看到内容而不带动画。
 *
 * @param children   - 要动画显示的内容
 * @param className  - 额外的 CSS 类名
 * @param delay      - 错位延迟（秒），默认 0
 * @param direction  - 滑入方向（默认 "up"）
 * @param margin     - 视口触发边距（默认 "-50px"）
 */
export default function AnimatedSection({
  children,
  className = "",
  delay = 0,
  direction = "up",
  margin = "-50px",
}: AnimatedSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  // 将方向映射为初始 x/y 偏移
  const directionOffset = {
    up: { y: 24, x: 0 },
    down: { y: -24, x: 0 },
    left: { x: 24, y: 0 },
    right: { x: -24, y: 0 },
    none: { x: 0, y: 0 },
  };

  const offset = directionOffset[direction];

  // 尊重 prefers-reduced-motion：不带动画直接渲染
  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: offset.y, x: offset.x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.16, 1, 0.3, 1], // 自定义 cubic-bezier：平滑减速
      }}
    >
      {children}
    </motion.div>
  );
}
