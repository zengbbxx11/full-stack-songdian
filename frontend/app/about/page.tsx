/*
 * 文件：app/about/page.tsx（关于我们 / About）
 * 职责：企业介绍页，展示品牌故事、发展时间线、价值观、研发实力、认证资质与工厂视频。
 * 数据来源：本地常量 ABOUT、COMPANY（@/lib/content-data）；不请求 WP REST API。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 * 是否含 client 组件：是 —— AnimatedCounter、HorizontalTimeline、FactoryVideo 为客户端组件。
 */

import { superMeta } from "next-super-meta";
import Link from "next/link";
import Image from "next/image";
import Breadcrumbs from "@/components/Breadcrumbs";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import HorizontalTimeline from "@/components/HorizontalTimeline";
import SectionHeading from "@/components/SectionHeading";
import FactoryVideo from "@/components/FactoryVideo";
import CertificateGallery from "@/components/CertificateGallery";
import { MEDIA } from "@/lib/media";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY, ABOUT } from "@/lib/content-data";

export const metadata = await superMeta({
  title: "About Us",
  description: `Learn about ${COMPANY.name} — a leading OEM/ODM digital camera manufacturer with 20+ years of experience, serving brands in 60+ countries worldwide.`,
  url: "/about",
});

// ISR 重新验证间隔（秒）：静态内容每小时刷新一次
export const revalidate = 3600;

export default function AboutPage() {
  const breadcrumbs = generateBreadcrumbs([{ label: "About" }]);

  return (
    <>
      {/* 区块 1 —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 区块 2+3 —— 品牌故事 + 数据统计（合并） */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            {/* 左栏 —— 品牌故事 */}
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "#d4343e" }}>
                Who We Are
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-6">
                {ABOUT.story.title}
              </h2>
              <div className="space-y-5 text-gray-600 leading-relaxed">
                {ABOUT.story.content.map((p, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? "text-[16px] md:text-[17px] text-gray-700 leading-relaxed"
                        : "text-[15px] md:text-base"
                    }
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>

            {/* 右栏 —— 紧凑数据统计条（细线网格，无卡片） */}
            {/* lg 以上用左侧细竖线 + 左内边距，与左栏品牌故事形成「两栏一体」的视觉关系 */}
            <div className="lg:col-span-5 lg:border-l lg:border-[#EEEEEE] lg:pl-16">
              {/* 与左栏 "Who We Are" 呼应的小标题，建立左右两栏的对称节奏 */}
              <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "#d4343e" }}>
                By the Numbers
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:gap-x-10">
                {ABOUT.stats.map((stat, idx) => (
                  <div
                    key={stat.label}
                    className={
                      idx === 0
                        ? "border-t-2 pt-4" /* 首项焦点：品牌红加粗细线 */
                        : "border-t border-[#E5E5E5] pt-4"
                    }
                    style={idx === 0 ? { borderTopColor: "#d4343e" } : undefined}
                  >
                    <AnimatedCounter
                      target={stat.value}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      format={stat.format}
                      className="text-3xl md:text-4xl"
                    />
                    <p
                      className="text-xs mt-2 font-medium uppercase tracking-wide"
                      style={{ color: "#5C5E62" }}
                    >
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 区块 4 —— 发展历程 */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeading className="mb-14">Our Journey</SectionHeading>
          <HorizontalTimeline items={ABOUT.timeline} />
        </div>
      </section>

      {/* 区块 5 —— 制造实力 + 工厂视频（位于时间线之后） */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          {/* 品牌红 eyebrow + 区块标题，与「Who We Are / By the Numbers」的视觉语言呼应 */}
          <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "#d4343e" }}>
            Manufacturing Excellence
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-10">
            {ABOUT.factory.title}
          </h2>

          {/* 三大能力卡片：Mega Factory / Production Capability / Innovation Technology
              沿用「价值观」同款白卡 + 细灰边 + 圆角，保持整站组件语言统一 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {ABOUT.manufacturing.map((block) => (
              <div
                key={block.title}
                className="p-8 bg-white border border-[#EEEEEE] hover:border-[#D0D1D2] transition-colors"
                style={{ borderRadius: "12px", transitionDuration: "0.33s" }}
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{block.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#5C5E62" }}>{block.body}</p>
              </div>
            ))}
          </div>

          {/* 工厂视频 */}
          <FactoryVideo
            src={MEDIA.factoryVideo}
            label="Play Songdian factory tour video"
          />
          <p
            className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed"
            style={{ color: "#5C5E62" }}
          >
            {ABOUT.factory.caption}
          </p>
        </div>
      </section>

      {/* 区块 6 —— 资质认证（图标格栅 + 点击 Lightbox 高清大图） */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeading className="mb-3">Certifications &amp; Compliance</SectionHeading>
          <p className="mb-10 text-sm" style={{ color: "#5C5E62" }}>
            Click any certificate to view the full image.
          </p>
          <CertificateGallery items={ABOUT.certificationImages} />
        </div>
      </section>

      {/* 区块 7 —— 行动号召（电光蓝） */}
      <section className="py-16 md:py-24" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-white tracking-tight mb-4" style={{ fontSize: "30px", fontWeight: 500, color: "#FFFFFF" }}>
            Ready to Partner With Us?
          </h2>
          <p className="max-w-md mx-auto mb-8" style={{ color: "#8E8E8E" }}>
            Let&apos;s discuss your camera project and explore how we can bring your vision to market.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center px-8 text-white text-sm font-medium rounded transition-colors bg-[#3E6AE1] hover:bg-[#3561CC]"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "#FFFFFF",
              height: "44px",
              borderRadius: "4px",
              transitionDuration: "0.33s",
            }}
          >
            Get in Touch
            <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>
    </>
  );
}
