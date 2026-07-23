/*
 * 文件：app/solutions/faq/page.tsx（常见问题 / FAQ）
 * 职责：常见问题解答页。左侧粘性分类目录（锚点直达 + 滚动高亮），
 *       右侧按分类分区的手风琴问答，并注入 FAQ JSON-LD 结构化数据。
 * 数据来源：本地常量 FAQS（@/lib/content-data）；faqSchema()（@/lib/seo）。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 * 交互组件：FaqToc（client）负责目录锚点导航；问答折叠用原生 <details>。
 */

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { superMeta } from "next-super-meta";
import Breadcrumbs from "@/components/Breadcrumbs";
import FaqToc, { CATEGORY_ICONS } from "@/components/FaqToc";
import { generateBreadcrumbs, faqSchema } from "@/lib/seo";
import { FAQS } from "@/lib/content-data";

export const metadata = await superMeta({
  title: "FAQ",
  description:
    "Answers to common questions about our camera manufacturing solutions — factory capabilities, certifications, quality control, lead times, customization, and after-sales support.",
  url: "/solutions/faq",
});

// ISR 重新验证间隔（秒）：静态内容每小时刷新一次
export const revalidate = 3600;

/** 将分类标题转为 URL 友好的锚点 id */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function FAQPage() {
  const breadcrumbs = generateBreadcrumbs([
    { label: "Solutions", href: "/solutions" },
    { label: "FAQ" },
  ]);

  const allFaqs = FAQS.flatMap((c) => [...c.items]);
  const schema = faqSchema(allFaqs.map((f) => ({ question: f.question, answer: f.answer })));

  // 目录数据：锚点 id + 分类名 + 问题数
  const toc = FAQS.map((c) => ({
    id: slugify(c.category),
    label: c.category,
    count: c.items.length,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* 首屏 —— 仅含面包屑，与其他页面保持一致 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 主体：左侧粘性目录 + 右侧分类问答 */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-12">
            {/* 分类目录 —— 桌面端粘性侧栏 / 移动端粘性横向胶囊条 */}
            <aside className="sticky top-16 lg:top-24 self-start z-30 mb-8 lg:mb-0">
              <FaqToc categories={toc} />
            </aside>

            {/* 问答内容 */}
            <div className="min-w-0 space-y-12 lg:space-y-16">
              {FAQS.map((category) => {
                const CatIcon = CATEGORY_ICONS[category.category];
                return (
                  <section
                    key={category.category}
                    id={slugify(category.category)}
                    className="scroll-mt-24"
                  >
                    <div className="flex items-center gap-3 mb-5">
                      {CatIcon && (
                        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#F4F4F4] text-[#3E6AE1] shrink-0">
                          <CatIcon className="w-5 h-5" />
                        </span>
                      )}
                      <h2 className="text-xl md:text-2xl font-semibold text-[#171A20] tracking-tight">
                        {category.category}
                      </h2>
                    </div>

                    <div className="space-y-3">
                      {category.items.map((faq) => (
                        <details
                          key={faq.question}
                          className="group rounded-xl border border-[#EEEEEE] bg-white overflow-hidden transition-colors hover:border-[#D0D1D2] group-open:border-[#d4343e]"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-[#171A20]">
                            <span>{faq.question}</span>
                            <ChevronDown className="w-5 h-5 shrink-0 text-[#8E8E8E] transition-transform duration-300 group-open:rotate-180 group-open:text-[#d4343e]" />
                          </summary>
                          <div
                            className="px-5 pb-5 text-[14px] leading-relaxed"
                            style={{ color: "#5C5E62" }}
                          >
                            {faq.answer}
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* 收尾 CTA —— 找不到答案时引导至联系页 */}
              <div className="rounded-xl border border-[#EEEEEE] bg-[#F4F4F4] p-8 text-center">
                <h3 className="text-lg font-semibold text-[#171A20]">Still have questions?</h3>
                <p className="mt-2 text-sm mx-auto max-w-md" style={{ color: "#5C5E62" }}>
                  Our team typically replies within 24 hours with a free, no-obligation quote.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center px-6 py-3 mt-5 rounded text-white text-sm font-medium bg-[#3E6AE1] hover:bg-[#3561CC] transition-colors"
                >
                  Contact Our Team
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
