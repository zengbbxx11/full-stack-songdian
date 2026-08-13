/*
 * 文件：app/page.tsx（首页 / Homepage）
 * 职责：网站首页，聚合展示信任条、精选产品、核心优势与最新资讯。
 *
 * 弱网优化架构：
 *   - 静态区块（Trust Strip / Why Choose Us / Global ODM / CTA）
 *     无需 API，首帧即渲染
 *   - 数据区块（Hero / Product Categories / Exhibitions / News）
 *     各自独立的 Suspense 边界，流式到达，互不阻塞
 *
 * 数据来源（后端 API /api/v1，仅在 Suspense 内的 async 组件中触发）：
 *   - Hero Banner           → 本地 public/banner/banner.webp
 *   - getProductCategories()→ 产品分类
 *   - getProducts()         → 分类下的产品预览图
 *   - getPosts()            → 新闻列表
 *   - getExhibitions()      → 文件系统展会图片
 *
 * 渲染方式：Streaming SSR + ISR（revalidate = 60 秒）。
 */

import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { getPosts } from "@/lib/api/news";
import { getProducts, getProductCategories } from "@/lib/api/products";
import NewsGrid from "@/components/NewsGrid";
import HeroSection from "@/components/motion/HeroSection";
import AnimatedSection from "@/components/motion/AnimatedSection";
import ExhibitionMarquee from "@/components/ExhibitionMarquee";
import StatsBand from "@/components/StatsBand";
import { getExhibitions } from "@/lib/exhibitions";
import { ShieldCheck, ArrowRight, Camera, Award, Zap, Factory, Lightbulb, Globe, Package, Play, type LucideIcon } from "lucide-react";
import { superMeta } from "next-super-meta";
import { STRENGTHS, COMPANY, GLOBAL_ODM, TRUST_CERTS, CATEGORY_SHOWCASE } from "@/lib/content-data";
import { MEDIA } from "@/lib/media";
import type { WCProductCategory } from "@/lib/types";
import HomeCtaSection from "@/components/HomeCtaSection";

const STRENGTH_ICONS: Record<string, LucideIcon> = {
  award: Award, zap: Zap, factory: Factory, lightbulb: Lightbulb, globe: Globe, package: Package,
};

export const metadata = await superMeta({
  title: "OEM/ODM Digital Camera Manufacturer & Factory",
  description: COMPANY.description,
  url: "/",
});

export const revalidate = 60;

// ============================================================
// Streaming async sections — 各自独立获取数据，流式到达
// ============================================================

/** Hero 区块 — 使用本地 public 下的 Banner 图（路径统一收口到 lib/media.ts 的 MEDIA.heroBanner） */
async function HeroSectionAsync() {
  return <HeroSection bannerUrl={MEDIA.heroBanner} />;
}

/** 产品类目展示 — 异步获取分类及每个分类下的最新产品图 */
async function ProductCategoriesSection() {
  const categories = await getProductCategories().catch(() => [] as WCProductCategory[]);

  const categoryOrder = ["mirrorless", "compact", "action", "video", "kids"] as const;
  const sortedCategories = categoryOrder
    .map((slug) => categories.find((c) => c.slug.toLowerCase().includes(slug)))
    .filter((c): c is WCProductCategory => Boolean(c));

  if (sortedCategories.length === 0) return null;

  const categoryProducts = await Promise.all(
    sortedCategories.map((cat) =>
      getProducts({ category: cat.id, perPage: 1 }).catch(() => ({ products: [], pagination: null }))
    )
  );

  const categoryCards = sortedCategories.map((cat, i) => ({
    category: cat,
    meta: CATEGORY_SHOWCASE[categoryOrder[i]] ?? { name: cat.name, description: "" },
    product: categoryProducts[i]?.products?.[0] ?? null,
  }));

  return (
    <AnimatedSection>
    <section className="section-shell bg-[#f5f6f7]">
      <div className="site-container">
        <div className="mb-12 flex items-end justify-between md:mb-16">
          <div>
            <span className="section-eyebrow">Product Categories</span>
            <h2 className="section-title mt-4">Cameras We Manufacture</h2>
          </div>
          <Link href="/products" className="hidden md:inline-flex items-center text-sm font-medium transition-colors hover:text-[#d4343e]" style={{ color: "#393C41", transitionDuration: "0.33s" }}>
            View All <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:h-[520px] lg:gap-3">
          {categoryCards.map(({ category, meta, product }, i) => (
            <Link
              key={category.id}
              href={`/products?category=${category.slug}`}
              className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-[#171A20] transition-[flex-grow] duration-500 ease-out sm:aspect-[3/4] lg:aspect-auto lg:h-full lg:min-w-0 lg:flex-1 lg:contain-layout lg:hover:flex-[2.5]"
              aria-label={`${meta.name} — view products`}
            >
              {product?.image ? (
                <Image
                  src={product.image}
                  alt={product.imageAlt || meta.name}
                  fill
                  sizes="(max-width: 1024px) 50vw, 20vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08] will-change-transform transform-gpu"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/30">
                  <Camera className="w-12 h-12" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold tabular-nums" style={{ color: "#d4343e" }} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-xl font-semibold leading-snug tracking-[-0.03em]">{meta.name}</h3>
                </div>
                <div className="overflow-hidden max-h-0 opacity-0 transition-all duration-500 ease-out group-hover:delay-500 group-hover:max-h-28 group-hover:opacity-100">
                  <p className="mt-2 text-[12px] leading-snug text-white/80 line-clamp-2">{meta.description}</p>
                  <span className="mt-2 inline-flex items-center text-[12px] font-medium text-white/90">
                    Explore
                    <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Link href="/products" className="inline-flex items-center text-sm font-medium transition-colors hover:text-[#d4343e]" style={{ color: "#393C41", transitionDuration: "0.33s" }}>
            View All Products <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>
    </section>
    </AnimatedSection>
  );
}

/** 展会滚动墙 — 读取文件系统（本机极快，但仍独立 Suspense 以不阻塞首帧） */
async function ExhibitionSection() {
  const exhibitions = getExhibitions();
  if (exhibitions.length === 0) return null;

  return (
    <AnimatedSection>
    <section className="py-16 md:py-24 bg-white border-y border-[#EEEEEE]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#d4343e" }}>Global Presence</span>
          <h2 className="mt-2 tracking-tight" style={{ fontSize: "30px", fontWeight: 500, color: "#171A20" }}>Trade Shows We&apos;ve Attended</h2>
          <p className="mt-3 text-base font-medium mx-auto max-w-2xl" style={{ color: "#5C5E62" }}>
            We showcase our latest OEM / ODM camera innovations at leading industry events worldwide — click to view full photos.
          </p>
        </div>
        <ExhibitionMarquee items={exhibitions} />
      </div>
    </section>
    </AnimatedSection>
  );
}

/** 最新资讯 — 异步获取文章列表 */
async function NewsSection() {
  // 兜底：构建期/后端不可达时降级为空数组，避免预渲染失败（Next build 会执行本组件）
  const { posts } = await getPosts({ perPage: 3 }).catch(() => ({ posts: [], pagination: null }));

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <AnimatedSection>
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#5C5E62" }}>News &amp; Insights</span>
            <h2 className="mt-2 tracking-tight" style={{ fontSize: "30px", fontWeight: 500, color: "#171A20" }}>Latest Updates</h2>
          </div>
          <Link href="/news" className="hidden md:inline-flex items-center text-sm font-medium transition-colors" style={{ color: "#393C41", transitionDuration: "0.33s" }}>
            View All <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
        </AnimatedSection>

        {posts.length > 0 ? (
          <NewsGrid posts={posts} />
        ) : (
          <div className="text-center py-12 text-gray-400 bg-white border border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
            <p className="text-sm">No articles published yet. Add posts in the admin panel.</p>
          </div>
        )}

        <div className="mt-8 text-center md:hidden">
          <Link href="/news" className="inline-flex items-center text-sm font-medium transition-colors" style={{ color: "#393C41", transitionDuration: "0.33s" }}>
            View All News <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Suspense 回退骨架
// ============================================================

function HeroFallback() {
  return (
    <section className="relative bg-[#171A20] flex items-end min-h-[70vh]" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
      </div>
    </section>
  );
}

function CategoriesFallback() {
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-3 w-24 rounded animate-pulse bg-[#E5E5E5] mb-3" />
        <div className="h-8 w-64 rounded animate-pulse bg-[#E5E5E5] mb-10" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl animate-pulse bg-[#E5E5E5]" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsFallback() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-3 w-24 rounded animate-pulse bg-[#E5E5E5] mb-3" />
        <div className="h-8 w-48 rounded animate-pulse bg-[#E5E5E5] mb-10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-[16/10] rounded-xl animate-pulse bg-[#F4F4F4]" style={{ animationDelay: `${i * 0.1}s` }} />
              <div className="h-4 w-24 rounded animate-pulse bg-[#E5E5E5]" />
              <div className="h-5 w-3/4 rounded animate-pulse bg-[#E5E5E5]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// 主页面 — 静态区块立即渲染，数据区块 Suspense 流式到达
// ============================================================

export default function HomePage() {
  return (
    <>
      {/* ═══ 流式区块：Hero Banner ═══ */}
      <Suspense fallback={<HeroFallback />}>
        <HeroSectionAsync />
      </Suspense>

      {/* ═══ 静态区块：信任条 — 零 API，首帧即出 ═══ */}
      <section className="border-b border-black/8 bg-white py-5">
        <div className="site-container">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-10 lg:overflow-visible lg:pb-0">
            {TRUST_CERTS.map((cert) => (
              <li
                key={cert.code}
                className="flex shrink-0 items-center justify-center gap-1.5 border-r border-black/8 px-4 py-2 last:border-r-0 lg:px-2"
                title={cert.full}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "#d4343e" }} aria-hidden="true" />
                <span className="text-sm font-medium" style={{ color: "#393C41" }}>{cert.code}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ 流式区块：产品类目 ═══ */}
      <Suspense fallback={<CategoriesFallback />}>
        <ProductCategoriesSection />
      </Suspense>

      {/* ═══ 静态区块：核心优势 — 零 API ═══ */}
      <AnimatedSection>
      <section className="section-shell bg-white">
        <div className="site-container">
          <div className="mb-14 max-w-3xl md:mb-16">
            <span className="section-eyebrow">Why Choose Us</span>
            <h2 className="section-title mt-4">Manufacturing Excellence</h2>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STRENGTHS.map((item) => {
              const Icon = STRENGTH_ICONS[item.icon] ?? ShieldCheck;
              return (
                <div
                  key={item.title}
                  className="group relative flex flex-col rounded-2xl border border-black/8 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#d4343e]/40 hover:shadow-[0_18px_45px_rgba(17,19,22,0.08)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d4343e]/8 text-[#d4343e] transition-colors duration-300 group-hover:bg-[#d4343e] group-hover:text-white">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[#171A20]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5C5E62]">{item.description}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex justify-start md:mt-12">
            <Link
              href="/about#factory-tour"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-[#f5f6f7] px-5 text-sm font-semibold text-[#171A20] transition-colors hover:border-[#d4343e] hover:text-[#d4343e]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Watch Factory Tour
            </Link>
          </div>
        </div>
      </section>
      </AnimatedSection>

      {/* ═══ 静态区块：核心经营数据带（深色，数字滚动入场） ═══ */}
      <StatsBand />

      {/* ═══ 静态区块：全球 ODM 合作伙伴 ═══ */}
      <AnimatedSection>
      <section className="section-shell bg-[#f5f6f7]">
        <div className="site-container">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "#d4343e" }}>
            {GLOBAL_ODM.eyebrow}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-3">
            {GLOBAL_ODM.title}
          </h2>
          <div className="mb-8 max-w-2xl">
            <p className="text-lg font-semibold text-gray-900 leading-snug">{GLOBAL_ODM.tagline}</p>
            <p className="text-base font-medium mt-1" style={{ color: "#5C5E62" }}>{GLOBAL_ODM.taglineSecondary}</p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-[#EEEEEE]">
            <Image
              src={MEDIA.globalOdmPartners}
              alt="Global ODM partner and export network map"
              width={1200}
              height={500}
              className="w-full h-auto"
              loading="lazy"
            />
          </div>

          <p className="mt-6 text-sm leading-relaxed max-w-3xl mx-auto text-center" style={{ color: "#5C5E62" }}>
            {GLOBAL_ODM.exportDescription}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {GLOBAL_ODM.brands.map((brand) => (
              <span key={brand} className="rounded-lg border border-[#EEEEEE] bg-white px-3 py-1 text-[13px] font-medium text-[#393C41]">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>
      </AnimatedSection>

      {/* ═══ 流式区块：展会 ═══ */}
      <Suspense fallback={null}>
        <ExhibitionSection />
      </Suspense>

      {/* ═══ 流式区块：最新资讯 ═══ */}
      <Suspense fallback={<NewsFallback />}>
        <NewsSection />
      </Suspense>

      {/* ═══ 静态区块：CTA — 客户端组件（含交互式悬停按钮） ═══ */}
      <HomeCtaSection />
    </>
  );
}
