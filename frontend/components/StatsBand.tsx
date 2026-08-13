"use client";

/*
 * StatsBand —— 首页核心经营数据展示带（数字滚动入场）
 * 深色 Carbon Dark 背景，打破首页浅色区块节奏，形成明暗层次。
 * 数字使用 framer-motion 的 spring 做 count-up 滚动，滚动进入视口时触发一次；
 * 尊重系统“减少动态效果”偏好，开启时直接显示最终数值。
 * 数据源：ABOUT.stats（content-data），全部为真实经营指标。
 */

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { ABOUT } from "@/lib/content-data";

// 单个数字的 count-up：spring 驱动，进入视口后从 0 滚到目标值
function Counter({ value, format }: { value: number; format?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: 1600, bounce: 0 });
  const inView = useInView(ref, { once: true, margin: "-40px" });

  // 进入视口即驱动到目标值（减少动态时跳过，直接由下方渲染终值）
  useEffect(() => {
    if (inView && !prefersReducedMotion) motionValue.set(value);
  }, [inView, value, motionValue, prefersReducedMotion]);

  // 订阅 spring 变化，直接写入文本（避免频繁 setState 造成的重渲染）
  useEffect(() => {
    if (prefersReducedMotion) return;
    return spring.on("change", (latest) => {
      if (ref.current) {
        const rounded = Math.round(latest);
        ref.current.textContent = format ? rounded.toLocaleString("en-US") : String(rounded);
      }
    });
  }, [spring, format, prefersReducedMotion]);

  // SSR 始终输出真实值；动画增强只在客户端进入视口后覆盖文本。
  return <span ref={ref}>{format ? value.toLocaleString("en-US") : value}</span>;
}

export default function StatsBand() {
  return (
    <section className="bg-[#111316] py-16 md:py-20" aria-label="Company at a glance">
      <div className="site-container">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
          {ABOUT.stats.map((s) => (
            <div key={s.label} className="border-l border-white/12 pl-4 text-left md:pl-6">
              <dd className="text-4xl md:text-5xl font-semibold tracking-tight text-white tabular-nums">
                <Counter value={s.value} format={s.format} />
                {s.suffix}
              </dd>
              <dt className="mt-2 text-sm font-medium text-white/55">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
