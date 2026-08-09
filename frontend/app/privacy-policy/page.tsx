/*
 * 文件：app/privacy-policy/page.tsx（隐私政策 / Privacy Policy）
 * 职责：法律页，阐述网站如何收集、使用与保护个人数据，并列出用户权利与联系方式。
 * 数据来源：PRIVACY（@/lib/content-data）存正文；“Contact Us”小节由
 *          COMPANY 动态渲染，保证公司名称 / 地址 / 邮箱 / 电话与全站同步。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 * 设计：沿用 about 页语言 —— 顶部碳灰面包屑、品牌红 eyebow、Carbon 标题、
 *          Pewter 正文、电光蓝 CTA，全站视觉一致。
 */

import { superMeta } from "next-super-meta";
import Breadcrumbs from "@/components/Breadcrumbs";
import { CtaButton } from "@/components/CtaButton";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY, PRIVACY } from "@/lib/content-data";
import { getPublicSettings } from "@/lib/api/settings";

export const metadata = await superMeta({
  title: "Privacy Policy",
  description: `How ${COMPANY.name} collects, uses, and protects your personal information.`,
  url: "/privacy-policy",
});

// ISR 重新验证间隔（秒）：静态法律内容每小时刷新一次
export const revalidate = 3600;

export default async function PrivacyPage() {
  // 从后端获取可配置的联系信息，fallback 到硬编码常量
  const settings = await getPublicSettings();
  const email = settings.company_email || COMPANY.contact.email;
  const phone = settings.company_phone || COMPANY.contact.phone;
  const address = settings.company_address || COMPANY.contact.address;

  const breadcrumbs = generateBreadcrumbs([{ label: "Privacy Policy" }]);

  return (
    <>
      {/* 区块 1 —— 仅含面包屑（碳灰底） */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 区块 2 —— 开篇 + 政策正文 */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          {/* 标题区 */}
          <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-3" style={{ color: "#d4343e" }}>
            Legal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm" style={{ color: "#5C5E62" }}>
            Last updated: {PRIVACY.lastUpdated}
          </p>
          <p className="mt-6 text-[15px] md:text-base leading-relaxed text-gray-600">
            {PRIVACY.intro}
          </p>

          {/* 政策各小节 */}
          <div className="mt-14 space-y-12">
            {PRIVACY.sections.map((section) => (
              <div key={section.id} id={section.id}>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight mb-4">
                  {section.title}
                </h2>
                {section.paragraphs?.map((p, i) => (
                  <p
                    key={i}
                    className="mt-3 text-[15px] md:text-base leading-relaxed text-gray-600"
                  >
                    {p}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-3 space-y-2 text-[15px] md:text-base leading-relaxed text-gray-600 list-disc pl-5">
                    {section.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {/* Contact Us —— 由 COMPANY 动态渲染，保持与全站同步 */}
            <div id="contact">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight mb-4">
                13. Contact Us
              </h2>
              <p className="text-[15px] md:text-base leading-relaxed text-gray-600">
                Questions about this policy or your personal data? Contact our team:
              </p>
              <div className="mt-3 space-y-1 text-[15px] md:text-base leading-relaxed text-gray-600">
                <p className="font-semibold text-gray-900">{COMPANY.fullName}</p>
                <p>Address: {address}</p>
                <p>
                  Email:{" "}
                  <a
                    href={`mailto:${email}`}
                    className="text-[#3E6AE1] hover:underline"
                    style={{ fontWeight: 500 }}
                  >
                    {email}
                  </a>
                </p>
                <p>Phone / WhatsApp: {phone}</p>
                <p>Business hours: {COMPANY.contact.hours}</p>
              </div>
            </div>
          </div>

          {/* 行动号召 —— 红底悬停，与全站 CTA 统一 */}
          <div className="mt-14 pt-8 border-t border-[#EEEEEE]">
            <CtaButton
              href="/contact"
              className="border-[#d4343e] bg-white text-[#171A20] shadow-sm h-[44px] px-8 text-[14px]"
            >
              Contact Us
            </CtaButton>
          </div>
        </div>
      </section>
    </>
  );
}
