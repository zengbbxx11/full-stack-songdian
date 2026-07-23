"use client";

/*
 * HeroSection —— 首页全屏 Banner（项目自定义动画组件）
 * 100vh 全屏 hero，以 SMT 产线实拍图为背景，叠加深色蒙层保证文字可读。
 * 标题/副标题/CTA 通过 framer-motion 的 staggerChildren 依次淡入；
 * 尊重系统“减少动态效果”偏好，开启时关闭错位动画。
 * 文案与配色取自 HERO / MEDIA 常量与品牌色（Electric Blue 等）。
 */

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { HERO } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";

/**
 * HeroSection — 首页全屏 Banner
 * ------------------------------------------------------------------
 * 100vh 全屏 hero，SMT 产线实拍图作背景。
 * 深色叠加层确保文字清晰可读，大号标题 + 居中布局。
 * 尊重 prefers-reduced-motion。
 */

const COLORS = {
  electricBlue: "#3E6AE1",
  electricBlueHover: "#3457B8",
  graphite: "#393C41",
  white: "#FFFFFF",
} as const;

interface HeroSectionProps {
  /** Banner 图片 URL（从 WordPress 页面读取，fallback 到 media.ts） */
  bannerUrl?: string;
}

export default function HeroSection({ bannerUrl }: HeroSectionProps) {
  // useReducedMotion：读取系统“减少动态效果”偏好，据此关闭错位动画。
  const prefersReducedMotion = useReducedMotion();

  // 减少动态时 staggerChildren 置 0，避免子元素依次动画。
  const staggerChildren = prefersReducedMotion ? 0 : 0.1;
  const itemVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };
  const TRANSITION = { duration: 0.33, ease: "easeOut" as const };

  return (
    <section className="relative overflow-hidden min-h-screen flex items-center">
      <Image
        src={bannerUrl || MEDIA.heroBanner}
        alt="Songdian SMT production line — precision camera manufacturing"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* 深色叠加层 — 40% 不透明度保证白字清晰 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Hero 内容 — 左侧对齐，更大气 */}
      <motion.div
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 py-32 md:py-40 w-full"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren, delayChildren: 0.1 },
          },
        }}
      >
        <div className="max-w-3xl">
        {/* 行业徽章 */}
        <motion.span
          variants={itemVariants}
          transition={TRANSITION}
          className="inline-block px-4 py-1.5 text-white text-sm font-medium rounded-full mb-8"
          style={{
            fontSize: "14px",
            fontWeight: 500,
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            color: COLORS.white,
          }}
        >
          {HERO.badge}
        </motion.span>

        {/* 主标题 — 大号醒目 */}
        <motion.h1
          variants={itemVariants}
          transition={TRANSITION}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold text-white tracking-tight leading-[1.05] mb-6"
        >
          {HERO.title}
        </motion.h1>

        {/* 副标题 — 20px，白色半透明 */}
        <motion.p
          variants={itemVariants}
          transition={TRANSITION}
          className="text-lg md:text-xl text-white/80 font-normal leading-relaxed mb-10 max-w-2xl"
        >
          {HERO.subtitle}
        </motion.p>

        {/* CTA 按钮 — 并排，大尺寸 */}
        <motion.div
          variants={itemVariants}
          transition={TRANSITION}
          className="flex flex-wrap items-center gap-4"
        >
          {/* 主按钮 — 蓝色，48px 高 */}
          <Link
            href={HERO.cta.primary.href}
            className="inline-flex items-center justify-center px-8 h-[48px] text-[16px] font-semibold text-white rounded bg-[#3E6AE1] hover:bg-[#3457B8] transition-colors duration-[330ms]"
            style={{ borderRadius: "4px" }}
          >
            {HERO.cta.primary.label}
            <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>

          {/* 副按钮 — 白底黑字，48px 高 */}
          <Link
            href={HERO.cta.secondary.href}
            className="inline-flex items-center justify-center px-8 h-[48px] text-[16px] font-semibold text-[#393C41] rounded bg-white hover:bg-[#F4F4F4] transition-colors duration-[330ms]"
            style={{ borderRadius: "4px" }}
          >
            {HERO.cta.secondary.label}
          </Link>
        </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
