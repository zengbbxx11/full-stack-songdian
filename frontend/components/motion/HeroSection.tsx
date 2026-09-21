/*
 * HeroSection —— 首页全屏 Banner（服务端组件）
 * section 布局类与全部叠加层（渐变蒙层 / 徽章 / 标题 / 副标题 / CTA / Scroll 提示）
 * 保持原样；背景图与轮播逻辑交给客户端组件 HeroCarousel（children 即下方叠加层，
 * 轮到第 2/3 张时叠加层淡出，仅显示图片）。
 */

import Link from "next/link";
import { HERO } from "@/lib/content-data";
import { CtaButton } from "@/components/CtaButton";
import HeroCarousel from "@/components/home/HeroCarousel";
import type { HomeBanner } from "@/lib/api/settings";

interface HeroSectionProps {
  /** 轮播图数据（公开设置 home_banners 的解析结果；为空时 HeroCarousel 回退默认 Banner） */
  banners?: HomeBanner[];
}

export default function HeroSection({ banners }: HeroSectionProps) {
  return (
    <HeroCarousel
      // 手机端高度：约 72% 视口高、下限 600px —— 主流做法（不占满屏，露出下一屏提示可滚动；
      // 满屏 hero 反而让人以为到底了）。max() 兼顾矮屏/横屏：section 是 overflow-hidden，
      // 太矮会把文案/按钮裁掉。≥768px 仍是 760px，≥1024px 与原来一致（视口 - 顶栏）。
      className="relative flex min-h-[max(600px,72svh)] items-center overflow-hidden md:min-h-[760px] lg:min-h-[calc(100svh-4rem)] xl:items-start"
      banners={banners}
    >
      {/* 渐变蒙层 — 底部最深、顶部最浅：文字区清晰可读，同时保留图片上部细节 */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.66)_48%,rgba(7,9,12,0.18)_100%)]" />
      <div className="absolute inset-0 opacity-20 tech-grid" aria-hidden="true" />

      {/* Hero 内容 — 左侧对齐，更大气 */}
      <div className="site-container relative z-10 py-10 sm:py-20 md:py-36 xl:pb-20 xl:pt-8">
        <div className="max-w-[820px] xl:max-w-[980px]">
        {/* 行业徽章 — 描边 + 毛玻璃，更精致 */}
        <span
          className="animate-fade-in-up mb-5 md:mb-8 inline-flex items-center gap-2 rounded-lg border-l-2 border-[var(--accent)] bg-white/8 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm"
        >
          {HERO.badge}
        </span>

        {/* 主标题 — 大号醒目 */}
        <h1
          className="animate-fade-in-up mb-5 md:mb-7 text-[clamp(2.5rem,7.3vw,6.8rem)] font-semibold leading-[0.94] tracking-[-0.04em] text-white [animation-delay:80ms]"
        >
          {HERO.title}
        </h1>

        {/* 副标题 — 白色半透明 */}
        <p
          className="animate-fade-in-up mb-6 md:mb-10 max-w-2xl text-base font-normal leading-relaxed text-white/72 [animation-delay:160ms] md:text-xl"
        >
          {HERO.subtitle}
        </p>

        {/* CTA 按钮 — 并排，大尺寸 */}
        <div className="animate-fade-in-up flex flex-wrap items-center gap-3 [animation-delay:240ms]">
          {/* 主按钮 — 交互式悬停按钮（白底+红点，hover 时红点放大填满、白字滑入） */}
          <CtaButton
            href={HERO.cta.primary.href}
            ctaLabel="Home - Primary Hero CTA"
            fill="bg-[var(--accent)]"
            className="h-12 border-[var(--accent)] bg-white px-4 sm:px-8 text-[14px] sm:text-[15px] text-[var(--foreground)] hover:text-white"
          >
            {HERO.cta.primary.label}
          </CtaButton>

          {/* 副按钮 — 幽灵描边，与主按钮形成层次对比 */}
          <Link
            href={HERO.cta.secondary.href}
            prefetch={false}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/35 bg-white/5 px-4 sm:px-8 text-[14px] sm:text-[15px] font-semibold text-white transition-colors duration-[330ms] hover:border-white hover:bg-white hover:text-[var(--foreground)]"
          >
            {HERO.cta.secondary.label}
          </Link>
        </div>
        </div>
      </div>
      {/* 滚动引导指示由 HeroCarousel 渲染（仅单张时显示：有轮播时底部居中让给指示点） */}
    </HeroCarousel>
  );
}
