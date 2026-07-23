/*
 * 文件：app/solutions/page.tsx（解决方案概览 / Solutions）
 * 职责：解决方案介绍页。传达「位于中国的工厂 + 量身定制的解决方案」定位，
 *       并展示三大核心解决方案：OEM、ODM、SONGDIAN 品牌经销。
 * 数据来源：本地常量 SOLUTIONS / SOLUTIONS_HERO（@/lib/content-data）。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 */

import Link from "next/link";
import { superMeta } from "next-super-meta";
import { Factory, PencilRuler, Store, Check, ArrowRight } from "lucide-react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY, SOLUTIONS, SOLUTIONS_HERO } from "@/lib/content-data";

export const metadata = await superMeta({
  title: "Solutions",
  description: `Tailored camera manufacturing solutions from a China-based factory. OEM, ODM, and SONGDIAN brand distribution — high-quality cameras engineered and built to your needs. ${COMPANY.name}.`,
  url: "/solutions",
});

// ISR 重新验证间隔（秒）：静态内容每小时刷新一次
export const revalidate = 3600;

// Lucide 图标映射（与 SOLUTIONS[].icon 标识符对应）
const SOLUTION_ICONS = {
  factory: Factory,
  "pencil-ruler": PencilRuler,
  store: Store,
} as const;

export default function SolutionsPage() {
  const breadcrumbs = generateBreadcrumbs([{ label: "Solutions" }]);
  const hero = SOLUTIONS_HERO;

  return (
    <>
      {/* ====================== Hero ====================== */}
      <section className="relative overflow-hidden" style={{ backgroundColor: "#171A20" }}>
        {/* 细微点阵纹理，增强质感 */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "34px 34px",
          }}
        />
        {/* 面包屑（沿用全站深色首屏规范） */}
        <div className="relative max-w-7xl mx-auto px-6 pt-10">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
        {/* 核心主张 */}
        <div className="relative max-w-4xl mx-auto px-6 pb-16 md:pb-24 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
            style={{ color: "#d4343e" }}
          >
            {hero.eyebrow}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            {hero.title}
          </h1>
          <p
            className="mt-5 text-base md:text-lg leading-relaxed mx-auto max-w-2xl"
            style={{ color: "#C7C9CE" }}
          >
            {hero.subtitle}
          </p>
        </div>
      </section>

      {/* ====================== 三大核心解决方案 ====================== */}
      <section className="bg-[#F4F4F4] py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-3" style={{ color: "#d4343e" }}>
              Three Core Solutions
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: "#171A20" }}>
              One partner, three ways to market
            </h2>
          </div>

          <div className="space-y-6 md:space-y-8">
            {SOLUTIONS.map((sol) => {
              const Icon = SOLUTION_ICONS[sol.icon as keyof typeof SOLUTION_ICONS];
              return (
                <article
                  key={sol.id}
                  id={sol.id}
                  className="scroll-mt-24 rounded-2xl border border-[#EEEEEE] bg-white p-8 md:p-10 transition-all duration-300 hover:border-[#d4343e]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
                >
                  <div className="md:grid md:grid-cols-2 md:gap-10 md:items-center">
                    {/* 左：标识 + 文案 + CTA */}
                    <div>
                      <div className="flex items-center gap-4 mb-5">
                        <span
                          className="flex items-center justify-center w-12 h-12 rounded-xl text-white shrink-0"
                          style={{ backgroundColor: "#3E6AE1" }}
                        >
                          {Icon ? <Icon className="w-6 h-6" /> : null}
                        </span>
                        <span
                          className="text-sm font-semibold uppercase tracking-wide"
                          style={{ color: "#d4343e" }}
                        >
                          {sol.tagline}
                        </span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold tracking-tight" style={{ color: "#171A20" }}>
                        {sol.title}
                      </h3>
                      <p className="mt-3 text-sm md:text-base leading-relaxed" style={{ color: "#5C5E62" }}>
                        {sol.summary}
                      </p>
                      <Link
                        href="/contact"
                        className="inline-flex items-center mt-6 px-5 text-white text-sm font-medium rounded transition-colors hover:bg-[#3561CC]"
                        style={{ backgroundColor: "#3E6AE1", color: "#fff", height: "42px", borderRadius: "4px" }}
                      >
                        Request a Quote
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </div>

                    {/* 右：功能要点 */}
                    <ul className="mt-8 md:mt-0 space-y-3">
                      {sol.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-3 text-sm md:text-[15px]"
                          style={{ color: "#393C41" }}
                        >
                          <span
                            className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
                            style={{ backgroundColor: "#EAF0FF" }}
                          >
                            <Check className="w-3 h-3 text-[#3E6AE1]" />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ====================== 收尾 CTA ====================== */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="rounded-2xl px-8 py-12 md:px-12 text-center" style={{ backgroundColor: "#171A20" }}>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Not sure which solution fits?
            </h2>
            <p className="mt-3 text-base mx-auto max-w-xl" style={{ color: "#C7C9CE" }}>
              Tell us about your product and market — our team will recommend the fastest, most
              cost-effective path to launch.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-6 text-white text-sm font-medium rounded transition-colors hover:bg-[#3561CC]"
                style={{ backgroundColor: "#3E6AE1", height: "44px", borderRadius: "4px" }}
              >
                Request a Quote
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link
                href="/solutions/faq"
                className="inline-flex items-center justify-center px-6 text-sm font-medium rounded border border-white/25 text-white transition-colors hover:bg-white/10"
                style={{ height: "44px", borderRadius: "4px" }}
              >
                Read the FAQ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
