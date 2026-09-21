"use client";
/*
 * HeroCarousel —— 首页 Hero 轮播层（客户端组件）
 *
 * 职责拆分：HeroSection（服务端组件）保持 section 布局类与全部叠加层
 * （渐变蒙层 / 徽章 / 标题 / 副标题 / CTA / Scroll 提示）原样不动，作为 children 传入本组件；
 * 本组件只负责背景图轮播与指示点。
 *
 * 性能契约（不得破坏，见 frontend/DESIGN-tesla.md）：
 * - 第 1 张始终挂载并保持 <Image preload>（LCP 候选），无 JS / SSR 首帧即完整文案；
 * - 第 2、3 张首次激活时才挂载取图（已访问的层保持挂载，回切不重复下载），首屏字节零增加；
 * - 轮到第 2/3 张时叠加层淡出（opacity），文字/按钮仍保留在 HTML 中（SEO 不受影响）。
 *
 * 行为：6s 自动轮播（悬停 / 键盘焦点暂停，prefers-reduced-motion 不自动），
 * 仅一张启用时不渲染指示点、不启动定时器；指示点位于固定询盘栏（56px）上方。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { MEDIA } from "@/lib/media";
import type { HomeBanner } from "@/lib/api/settings";

const AUTOPLAY_MS = 6000;

const LEAD_ALT = "Songdian SMT production line — precision camera manufacturing";

/**
 * 单张轮播图。
 * - 未配移动端专用图：next/image（首图 `preload`，LCP 契约与改版前一致）。
 * - 配了移动端图（art direction）：用 `<picture>` —— 浏览器按断点**只下载匹配的那一张**，
 *   手机拿到竖版图、桌面拿到宽版图（next/image 不支持 media 源；这是 Next 官方对
 *   art direction 的建议做法）。代价是不走图片优化器，因此后台产图标准里给了体积上限。
 */
function SlideImage({ slide, lead }: { slide: HomeBanner; lead: boolean }) {
  const alt = lead ? LEAD_ALT : "";
  if (slide.mobileUrl) {
    return (
      <picture>
        <source media="(max-width: 767px)" srcSet={slide.mobileUrl} />
        <img
          src={slide.url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          loading={lead ? "eager" : "lazy"}
          fetchPriority={lead ? "high" : "auto"}
        />
      </picture>
    );
  }
  return <Image src={slide.url} alt={alt} fill preload={lead} sizes="100vw" className="object-cover" />;
}

interface HeroCarouselProps {
  /** Hero section 的既有布局类（由 HeroSection 传入，保持不变） */
  className: string;
  /** 轮播图数据（后台设置解析结果；为空时回退默认 Banner，官网与改版前一致） */
  banners?: HomeBanner[];
  /** 服务端渲染的叠加层（渐变蒙层、文案、按钮、Scroll 提示） */
  children: React.ReactNode;
}

export default function HeroCarousel({ className, banners, children }: HeroCarouselProps) {
  // 第 1 张是首屏主图：后台第 1 槽留空（url 为空）或完全未配置时，回退官网默认 Banner，
  // 保证「原有第一张图 + 悬浮文案」在未主动替换时保持原样。
  const slides: HomeBanner[] = (banners && banners.length > 0 ? banners.slice(0, 3) : [{ url: "", mobileUrl: "", href: "" }]).map(
    (banner, index) => (index === 0 && !banner.url ? { ...banner, url: MEDIA.heroBanner, href: "" } : banner),
  );
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const paused = hovered || focused || !visible;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let inViewport = false;
    const sync = () => setVisible(inViewport && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      sync();
    });
    observer.observe(section);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  // Cookie 提示条（fixed 底部，手机上约 174px 高）可见时隐藏指示点：既不遮挡，
  // 也不用把指示点往上挪（上挪会挤到 CTA 附近）。命中判据用 DOM 观察而非只看事件 ——
  // CookieConsent 的首帧广播可能早于本组件挂载（兄弟组件 effect 顺序），事件会漏。
  const [cookieVisible, setCookieVisible] = useState(false);

  useEffect(() => {
    const syncFromDom = () => {
      setCookieVisible(Boolean(document.querySelector('[role="region"][aria-label="Cookie consent"]')));
    };
    const onCookieVisibility = (event: Event) => {
      setCookieVisible(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("cookie-consent:visibility", onCookieVisibility);
    const observer = new MutationObserver(syncFromDom);
    observer.observe(document.body, { childList: true, subtree: true });
    syncFromDom();
    return () => {
      window.removeEventListener("cookie-consent:visibility", onCookieVisibility);
      observer.disconnect();
    };
  }, []);

  // 已激活过的图片层保持挂载（回切不重新下载）；第 1 张始终挂载
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));
  const goTo = useCallback((index: number) => {
    setActive(index);
    setMounted((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // 省流量/慢网（2G/3G）不自动轮播：避免在家用 Wi-Fi 之外替访客下载额外轮播图
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && /(^|-)(2g|3g)$/.test(connection.effectiveType)) return;
    const timer = window.setInterval(() => goTo((active + 1) % slides.length), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [active, paused, slides.length, goTo]);

  return (
    <section
      ref={sectionRef}
      className={className}
      // 仅对真正有悬停能力的指针（鼠标）暂停：触屏点按也会触发 mouseenter，
      // 若照常暂停，自动轮播会一直停到用户点按 section 之外才恢复
      onMouseEnter={() => {
        if (window.matchMedia("(hover: hover)").matches) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      // 仅键盘焦点（Tab 进入 CTA/指示点）暂停；鼠标点击产生的焦点不打断自动轮播
      onFocus={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {slides.map((slide, index) => {
        const isActive = active === index;
        const layerClass = `absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? "opacity-100" : "pointer-events-none opacity-0"}`;
        if (index === 0) {
          return (
            <div key={index} className={layerClass} inert={!isActive}>
              <SlideImage slide={slide} lead />
            </div>
          );
        }
        if (!mounted.has(index)) return null;
        const image = <SlideImage slide={slide} lead={false} />;
        return (
          <div key={index} className={layerClass} inert={!isActive}>
            {/* 第 2/3 张配置了跳转链接时整图可点（同窗口打开） */}
            {slide.href ? (
              <a href={slide.href} className="block h-full w-full" aria-label={`View more — banner ${index + 1}`}>
                {image}
              </a>
            ) : (
              image
            )}
          </div>
        );
      })}

      {/* 服务端渲染的叠加层：轮到第 2/3 张时整体淡出，回到第 1 张恢复 */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${active === 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}
        inert={active !== 0}
      >
        {children}
      </div>

      {/* 指示点：底部居中（与 Hero 文案轴对齐）；h-10 w-10 触控区。
          位置固定 bottom-24：保留与固定询盘栏的间距，不做上移（上移会挤进 CTA）。
          视觉：极简白点 —— 当前张更大更亮的纯白点，其余为半透明白点；
          不加底衬/描边/白环，只保留一层 1px 极轻投影（方案 B）。
          ⚠️ 已知限制：实测纯白底图（白色产品海报）上指示点仍基本不可见 —— 45% 黑 +
          3px 模糊的淡影在亮底对比不足；暗底/中灰底可辨。若要亮底也可辨，需改用
          mix-blend-difference（白点自动反相）等方案，见 DESIGN-tesla.md 的 Hero 章节。
          cookie 提示条可见时整块隐藏，避免被压住。 */}
      {slides.length > 1 && !cookieVisible && (
        <nav
          aria-label="Homepage banner carousel"
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1"
        >
          {slides.map((slide, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Go to banner ${index + 1}`}
              aria-current={active === index}
              className="flex h-10 w-10 touch-manipulation items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.45)] ${
                  active === index ? "h-2 w-2 bg-white" : "h-1.5 w-1.5 bg-white/45 hover:bg-white/80"
                }`}
              />
            </button>
          ))}
        </nav>
      )}

      {/* Scroll 提示：只在单张（没有轮播）时显示 —— 有轮播时底部居中已被指示点占用，
          两个提示挤在同一位置就是之前「重合」的原因；设计文档只要求它不被浮层覆盖。 */}
      {slides.length === 1 && (
        <div
          className="animate-fade-in absolute left-1/2 top-[calc(100svh-12rem)] z-10 hidden -translate-x-1/2 md:block [animation-delay:320ms]"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-2 text-white/70">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em]">Scroll</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}
