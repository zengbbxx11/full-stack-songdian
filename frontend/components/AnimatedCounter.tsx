"use client";

// 客户端组件：使用 IntersectionObserver 监听进入视口并触发数字滚动动画
import { useEffect, useRef, useState } from "react";

/**
 * AnimatedCounter — 数字滚动动画组件
 * ------------------------------------------------------------------
 * 进入视口后从 0 滚动到目标数字，带 ease-out 缓动。
 * 尺寸通过 `className` 控制，便于在紧凑布局中复用。
 */

interface CounterProps {
  /** 目标数字（不带格式，如 40000） */
  target: number;
  /** 显示格式：前缀 + 数字 + 后缀 */
  prefix?: string;
  suffix?: string;
  /** 数字格式化（true = 千分位逗号） */
  format?: boolean;
  /** 覆盖默认字号等样式 */
  className?: string;
}

export function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
  format = false,
  className = "",
}: CounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false); // 标记动画是否已播放，避免滚动回视口时重复触发

  // 进入视口时触发一次数字滚动动画
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1500;
          const startTime = performance.now();

          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(target * eased));

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  // 按 format 决定是否使用千分位逗号格式化
  const formatted = format ? count.toLocaleString("en-US") : count.toString();

  return (
    <div
      ref={ref}
      className={`font-bold tracking-tight tabular-nums ${className}`}
    >
      <span style={{ color: "#171A20" }}>
        {prefix}
        {formatted}
        {suffix}
      </span>
    </div>
  );
}
