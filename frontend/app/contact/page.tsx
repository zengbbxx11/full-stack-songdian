/*
 * 文件：app/contact/page.tsx（联系我们 / Contact）
 * 职责：联系方式展示 + 询盘表单，含公司地址/邮箱/电话、询盘须知与地图（Leaflet + Esri 卫星影像）。
 * 数据来源：本地常量 COMPANY、INQUIRY_GUIDE（@/lib/content-data）；
 *           localBusinessSchema()（@/lib/seo）；表单提交由 InquiryForm 处理。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 * 是否含 client 组件：是 —— InquiryForm、ContactMap 为客户端组件。
 */

import { superMeta } from "@/lib/site-meta";
import Breadcrumbs from "@/components/Breadcrumbs";
import ContactMap from "@/components/ContactMapLoader";
import InquiryForm from "@/components/form/InquiryForm";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";
import { getPublicSettings } from "@/lib/api/settings";
import { MapPin, Mail, Phone, Clock } from "lucide-react";

export const metadata = await superMeta({
  title: "Contact Songdian Sales",
  description: `Get in touch with ${COMPANY.name}. Request a quote for OEM/ODM camera manufacturing — our team responds within 24 hours.`,
  url: "/contact",
});

// ISR 重新验证间隔（秒）：静态内容每小时刷新一次
export const revalidate = 3600;

export default async function ContactPage() {
  // 从后端获取可配置的联系信息，fallback 到硬编码常量
  const settings = await getPublicSettings();
  const email = settings.company_email || COMPANY.contact.email;
  const emailAlt = COMPANY.contact.emailAlt;
  const phone = settings.company_phone || COMPANY.contact.phone;
  const whatsapp = settings.company_whatsapp || COMPANY.contact.whatsapp;
  const address = settings.company_address || COMPANY.contact.address;

  const breadcrumbs = generateBreadcrumbs([{ label: "Contact" }]);
  // Organization 结构化数据由 app/layout.tsx 全站输出（复用同一个 @id #manufacturer）；
  // 此处不再重复输出，避免同一页出现两个同 @id 的 Organization 块。

  // Keep the AMap View point confirmed by the owner; omit unverified directions.
  const amapView = `https://uri.amap.com/marker?position=${COMPANY.contact.lng},${COMPANY.contact.lat}&name=${encodeURIComponent(address)}&src=sonida&coordinate=wgs84&callnative=1`;
  const phoneHref = `tel:${phone.replace(/[^+\d]/g, "")}`;
  const whatsappHref = `https://wa.me/${whatsapp.replace(/\D/g, "")}`;

  return (
    <>
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-5">
        <div className="site-container">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="bg-[var(--surface-dark)] pb-8 pt-6 text-white md:pb-10">
        <div className="site-container">
          <p className="interior-heading-kicker">Start a conversation</p>
          <h1 className="interior-heading-title mt-3 max-w-4xl">Tell us what you want to build.</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75">Share your requirements with our team and request an OEM or ODM project quote.</p>
        </div>
      </section>

      <section className="bg-[var(--surface-soft)] py-8 md:py-14">
        <div className="site-container grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:gap-16">
          <div className="contact-form-panel order-1 min-w-0 lg:order-2">
            <InquiryForm />
          </div>

          <div className="contact-details order-2 min-w-0 lg:order-1 lg:pt-3">
            <h2 className="mb-7 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Contact Information</h2>
            <dl className="space-y-6">
              <div className="contact-detail flex gap-4">
                <Mail aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <dt className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Email</dt>
                  <dd>
                    <a href={`mailto:${email}`} className="inline-flex min-h-11 items-center text-lg font-medium tracking-tight transition-colors hover:text-[var(--accent)]">{email}</a>
                    <a href={`mailto:${emailAlt}`} className="flex min-h-11 items-center text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]">{emailAlt}</a>
                  </dd>
                </div>
              </div>
              <div className="contact-detail flex gap-4">
                <Phone aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <dt className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Phone / WhatsApp</dt>
                  <dd>
                    <a href={phoneHref} className="flex min-h-11 items-center text-base font-medium transition-colors hover:text-[var(--accent)]">Phone: {phone}</a>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]">WhatsApp: {whatsapp}</a>
                  </dd>
                </div>
              </div>
              <div className="contact-detail flex gap-4">
                <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <dt className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Address</dt>
                  <dd className="text-sm leading-7 text-[var(--muted-foreground)]">{address}</dd>
                </div>
              </div>
              <div className="contact-detail flex gap-4">
                <Clock aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <dt className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Business Hours</dt>
                  <dd className="text-sm leading-7 text-[var(--muted-foreground)]">{COMPANY.contact.hours}</dd>
                </div>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="border-t border-black/5 bg-white py-10 md:py-14" aria-labelledby="contact-location-title">
        <div className="site-container grid min-w-0 gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <p className="interior-heading-kicker interior-heading-kicker-light mb-3">Address</p>
            <h2 id="contact-location-title" className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Songdian Technology</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--muted-foreground)]">{address}</p>
            <a href={amapView} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
              <MapPin aria-hidden="true" className="h-4 w-4" />AMap View
            </a>
          </div>
          <div className="relative isolate z-0 h-[280px] w-full min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-gray-100 sm:h-[340px]">
            <ContactMap lat={COMPANY.contact.lat} lng={COMPANY.contact.lng} address={address} />
          </div>
        </div>
      </section>
    </>
  );
}
