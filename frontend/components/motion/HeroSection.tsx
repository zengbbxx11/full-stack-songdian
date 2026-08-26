/*
 * HeroSection —— 首页全屏 Banner（项目自定义动画组件）
 * 100vh 全屏 hero，以产线实拍图为背景，叠加渐变蒙层保证文字可读。
 * 首屏内容使用服务端 HTML 与轻量 CSS 淡入，避免加载完整客户端动画运行时。
 */

import Link from "next/link";
import Image from "next/image";
import { HERO } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";
import { CtaButton } from "@/components/CtaButton";

interface HeroSectionProps {
  /** Banner 图片 URL（缺省时回退到 media.ts 的 heroBanner） */
  bannerUrl?: string;
}

export default function HeroSection({ bannerUrl }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden flex min-h-[720px] items-center md:min-h-[760px] lg:min-h-[calc(100svh-4rem)]">
      <Image
        src={bannerUrl || MEDIA.heroBanner}
        alt="Songdian SMT production line — precision camera manufacturing"
        fill
        preload
        sizes="100vw"
        className="object-cover"
      />

      {/* 渐变蒙层 — 底部最深、顶部最浅：文字区清晰可读，同时保留图片上部细节 */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,9,12,0.9)_0%,rgba(7,9,12,0.66)_48%,rgba(7,9,12,0.18)_100%)]" />
      <div className="absolute inset-0 opacity-20 tech-grid" aria-hidden="true" />

      {/* Hero 内容 — 左侧对齐，更大气 */}
      <div className="site-container relative z-10 py-28 md:py-36">
        <div className="max-w-[820px]">
        {/* 行业徽章 — 描边 + 毛玻璃，更精致 */}
        <span
          className="animate-fade-in-up mb-8 inline-flex items-center gap-2 rounded-lg border-l-2 border-[#d4343e] bg-white/8 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm"
        >
          {HERO.badge}
        </span>

        {/* 主标题 — 大号醒目 */}
        <h1
          className="animate-fade-in-up mb-7 text-[clamp(3rem,7.3vw,6.8rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-white [animation-delay:80ms]"
        >
          {HERO.title}
        </h1>

        {/* 副标题 — 白色半透明 */}
        <p
          className="animate-fade-in-up mb-10 max-w-2xl text-base font-normal leading-relaxed text-white/72 [animation-delay:160ms] md:text-xl"
        >
          {HERO.subtitle}
        </p>

        {/* CTA 按钮 — 并排，大尺寸 */}
        <div className="animate-fade-in-up flex flex-wrap items-center gap-4 [animation-delay:240ms]">
          {/* 主按钮 — 交互式悬停按钮（白底+红点，hover 时红点放大填满、白字滑入） */}
          <CtaButton
            href={HERO.cta.primary.href}
            ctaLabel="Home - Primary Hero CTA"
            fill="bg-[#d4343e]"
            className="h-12 border-[#d4343e] bg-white px-8 text-[15px] text-[#171A20] hover:text-white"
          >
            {HERO.cta.primary.label}
          </CtaButton>

          {/* 副按钮 — 幽灵描边，与主按钮形成层次对比 */}
          <Link
            href={HERO.cta.secondary.href}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/35 bg-white/5 px-8 text-[15px] font-semibold text-white transition-colors duration-[330ms] hover:border-white hover:bg-white hover:text-[#171A20]"
          >
            {HERO.cta.secondary.label}
          </Link>
        </div>
        </div>
      </div>

      {/* 滚动引导指示 — 底部居中，缓慢上下浮动，引导用户下滚 */}
      <div className="animate-fade-in absolute bottom-8 left-1/2 z-10 -translate-x-1/2 [animation-delay:320ms]" aria-hidden="true">
        <div className="flex flex-col items-center gap-2 text-white/70">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em]">Scroll</span>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </section>
  );
}
