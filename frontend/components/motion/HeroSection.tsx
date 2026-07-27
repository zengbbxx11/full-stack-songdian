"use client";

/*
 * HeroSection —— 首页全屏 Banner（项目自定义动画组件）
 * 100vh 全屏 hero，以产线实拍图为背景，叠加渐变蒙层保证文字可读。
 * 标题/副标题/CTA 通过 framer-motion 的 staggerChildren 依次上浮淡入；
 * 底部带滚动引导指示；尊重系统“减少动态效果”偏好，开启时关闭错位动画。
 */

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { HERO } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";

interface HeroSectionProps {
  /** Banner 图片 URL（缺省时回退到 media.ts 的 heroBanner） */
  bannerUrl?: string;
}

export default function HeroSection({ bannerUrl }: HeroSectionProps) {
  // useReducedMotion：读取系统“减少动态效果”偏好，据此关闭错位与循环动画。
  const prefersReducedMotion = useReducedMotion();

  // 减少动态时 staggerChildren 置 0，避免子元素依次动画。
  const staggerChildren = prefersReducedMotion ? 0 : 0.12;

  // 子元素统一为上浮淡入（y: 24 → 0），比纯透明度过渡更有层次
  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  };
  // 与 AnimatedSection 一致的高级减速缓动，动效更顺滑
  const TRANSITION = { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const };

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

      {/* 渐变蒙层 — 底部最深、顶部最浅：文字区清晰可读，同时保留图片上部细节 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

      {/* Hero 内容 — 左侧对齐，更大气 */}
      <motion.div
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 py-32 md:py-40 w-full"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: { staggerChildren, delayChildren: 0.15 },
          },
        }}
      >
        <div className="max-w-3xl">
        {/* 行业徽章 — 描边 + 毛玻璃，更精致 */}
        <motion.span
          variants={itemVariants}
          transition={TRANSITION}
          className="inline-block rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm mb-8"
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

        {/* 副标题 — 白色半透明 */}
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
            className="group inline-flex items-center justify-center px-8 h-[48px] text-[16px] font-semibold text-white rounded bg-[#3E6AE1] hover:bg-[#3457B8] transition-colors duration-[330ms]"
            style={{ borderRadius: "4px" }}
          >
            {HERO.cta.primary.label}
            <svg className="w-5 h-5 ml-2 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* 滚动引导指示 — 底部居中，缓慢上下浮动，引导用户下滚 */}
      <motion.div
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.6 }}
        aria-hidden="true"
      >
        <motion.div
          animate={prefersReducedMotion ? {} : { y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2 text-white/70"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.2em]">Scroll</span>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  );
}
