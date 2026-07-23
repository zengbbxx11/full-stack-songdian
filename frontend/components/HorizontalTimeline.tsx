"use client";

// 客户端组件：framer-motion 进场动画依赖浏览器，且需读取偏好设置
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Flag,
  Camera,
  Building2,
  Award,
  Trophy,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * HorizontalTimeline — 横向时间轴（升级版）
 * ------------------------------------------------------------------
 * 桌面：横向布局，节点依次弹出 + 进度线从左向右"绘制"，hover 卡片上浮高亮。
 * 移动端：纵向布局，竖线从上向下绘制，节点错位淡入。
 * 进场动画基于 framer-motion 的 whileInView，且尊重 prefers-reduced-motion。
 */

interface TimelineItem {
  year: string;
  title: string;
  event: string;
}

interface HorizontalTimelineProps {
  items: readonly TimelineItem[];
}

const BRAND_RED = "#d4343e";
const BRAND_RED_SOFT = "#E8555E";
const CARBON = "#171A20";
const PEWTER = "#5C5E62";

/** 按年份匹配一个 Lucide 图标，让每个里程碑更有辨识度 */
const YEAR_ICONS: Record<string, LucideIcon> = {
  "2006": Flag,
  "2009": Camera,
  "2023": Building2,
  "2024": Award,
  "2025": Trophy,
};

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.14, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const nodeVariants: Variants = {
  hidden: { scale: 0.3, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 260, damping: 16 },
  },
};

export default function HorizontalTimeline({ items }: HorizontalTimelineProps) {
  const reduce = useReducedMotion();

  return (
    <div className="relative">
      {/* ============ 桌面端：横向 ============ */}
      <div className="hidden md:block">
        <motion.div
          className="flex items-start"
          variants={containerVariants}
          initial={reduce ? false : "hidden"}
          whileInView={reduce ? undefined : "visible"}
          viewport={{ once: true, amount: 0.25 }}
        >
          {items.map((item, i) => {
            const Icon = YEAR_ICONS[item.year] ?? Sparkles;
            return (
              <motion.div
                key={item.year}
                variants={itemVariants}
                className="flex items-start flex-1 min-w-0"
              >
                <div className="flex-1 flex flex-col items-center relative px-2 group cursor-default">
                  {/* 连线段 — 从当前节点右侧绘制到下一个节点左侧 */}
                  {i < items.length - 1 && (
                    <motion.div
                      className="absolute top-6 left-[calc(50%+22px)] h-[3px] rounded-full"
                      style={{
                        width: "calc(100% - 44px)",
                        background: `linear-gradient(90deg, ${BRAND_RED}, ${BRAND_RED_SOFT})`,
                        transformOrigin: "left",
                      }}
                      initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
                      whileInView={reduce ? undefined : { scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, ease: "easeInOut", delay: 0.25 + i * 0.14 }}
                    />
                  )}

                  {/* 节点 */}
                  <div className="relative w-12 h-12 mb-5">
                    {/* hover 脉冲圈 — 扩散淡出 */}
                    <span
                      className="absolute inset-0 rounded-full border-2 opacity-0 group-hover:opacity-40 group-hover:scale-[1.6] transition-all duration-500"
                      style={{ borderColor: BRAND_RED }}
                      aria-hidden
                    />
                    <motion.div
                      variants={nodeVariants}
                      className="relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2 bg-white group-hover:bg-[#d4343e] transition-colors duration-300 z-10"
                      style={{ borderColor: BRAND_RED }}
                    >
                      <span className="text-xs font-bold text-[#d4343e] group-hover:text-white transition-colors duration-300">
                        {i + 1}
                      </span>
                    </motion.div>
                  </div>

                  {/* 年份 + 图标 */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: BRAND_RED }} aria-hidden />
                    <span
                      className="text-xs font-bold tracking-wide"
                      style={{ color: BRAND_RED }}
                    >
                      {item.year}
                    </span>
                  </div>

                  {/* 标题 */}
                  <p
                    className="text-sm font-semibold text-center leading-snug mb-2 transition-colors duration-300 group-hover:text-[#d4343e]"
                    style={{ color: CARBON }}
                  >
                    {item.title}
                  </p>

                  {/* 详情卡片 — hover 上浮高亮 */}
                  <div className="w-full max-w-[210px] rounded-xl border border-transparent px-2 pt-1 pb-3 group-hover:border-[#F0C9CC] group-hover:bg-white group-hover:shadow-lg transition-all duration-300">
                    <p
                      className="text-xs text-center leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ color: PEWTER }}
                    >
                      {item.event}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* ============ 移动端：纵向 ============ */}
      <div className="md:hidden relative pl-12 space-y-10">
        {/* 竖线 — 从上向下绘制 */}
        <motion.div
          className="absolute left-[23px] top-3 bottom-3 w-[3px] rounded-full"
          style={{
            background: `linear-gradient(180deg, ${BRAND_RED}, ${BRAND_RED_SOFT})`,
            transformOrigin: "top",
          }}
          initial={reduce ? { scaleY: 1 } : { scaleY: 0 }}
          whileInView={reduce ? undefined : { scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeInOut", delay: 0.2 }}
        />

        <motion.div
          className="space-y-10"
          variants={containerVariants}
          initial={reduce ? false : "hidden"}
          whileInView={reduce ? undefined : "visible"}
          viewport={{ once: true, amount: 0.2 }}
        >
          {items.map((item, i) => {
            const Icon = YEAR_ICONS[item.year] ?? Sparkles;
            return (
              <motion.div
                key={item.year}
                variants={itemVariants}
                className="relative group"
              >
                {/* 节点 */}
                <div className="absolute -left-12 top-0 w-12 h-12">
                  <span
                    className="absolute inset-0 rounded-full border-2 opacity-0 group-hover:opacity-40 group-hover:scale-[1.6] transition-all duration-500"
                    style={{ borderColor: BRAND_RED }}
                    aria-hidden
                  />
                  <motion.div
                    variants={nodeVariants}
                    className="relative w-12 h-12 rounded-full flex items-center justify-center border-2 bg-white z-10"
                    style={{ borderColor: BRAND_RED }}
                  >
                    <span className="text-xs font-bold" style={{ color: BRAND_RED }}>
                      {i + 1}
                    </span>
                  </motion.div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: BRAND_RED }} aria-hidden />
                    <span
                      className="text-xs font-bold tracking-wide"
                      style={{ color: BRAND_RED }}
                    >
                      {item.year}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mb-1.5" style={{ color: CARBON }}>
                    {item.title}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: PEWTER }}>
                    {item.event}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
