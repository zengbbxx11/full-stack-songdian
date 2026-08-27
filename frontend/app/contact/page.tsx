/*
 * 文件：app/contact/page.tsx（联系我们 / Contact）
 * 职责：联系方式展示 + 询盘表单，含公司地址/邮箱/电话、询盘须知与地图（Leaflet + Esri 卫星影像）。
 * 数据来源：本地常量 COMPANY、INQUIRY_GUIDE（@/lib/content-data）；
 *           localBusinessSchema()（@/lib/seo）；表单提交由 InquiryForm 处理。
 * 渲染方式：静态生成 + ISR（revalidate = 3600 秒）。
 * 是否含 client 组件：是 —— InquiryForm、ContactMap 为客户端组件。
 */

import { superMeta } from "next-super-meta";
import Breadcrumbs from "@/components/Breadcrumbs";
import ContactMap from "@/components/ContactMapLoader";
import InquiryForm from "@/components/form/InquiryForm";
import { generateBreadcrumbs, localBusinessSchema, safeJsonLd } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";
import { getPublicSettings } from "@/lib/api/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wgs84ToGcj02 } from "@/lib/coord-transform";
import { MapPin, Navigation, Mail, Phone, Clock } from "lucide-react";

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
  const businessSchema = localBusinessSchema();

  // 高德传 WGS-84 并自动转 GCJ-02；Google 中国底图为 GCJ-02，
  // 故 Google 链接需先用 WGS-84 坐标换算成 GCJ-02，才能与高德落在同一点。
  const gmap = wgs84ToGcj02(COMPANY.contact.lat, COMPANY.contact.lng);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(businessSchema) }}
      />

      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-5">
        <div className="site-container">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="bg-[var(--surface-dark)] pb-10 pt-6 text-white md:pb-12 md:pt-8">
        <div className="site-container max-w-4xl">
          <p className="section-eyebrow">Start a conversation</p>
          <h1 className="mt-3 text-[clamp(2.55rem,4.5vw,4rem)] font-semibold leading-[1] tracking-[-0.05em]">Tell us what you want to build.</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/62 md:text-[17px]">Share your requirements with our team and request an OEM or ODM project quote.</p>
        </div>
      </section>

      {/* 主内容区 */}
      <section className="section-shell bg-[var(--surface-soft)]">
        <div className="site-container">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">

            {/* 左栏 */}
            <div className="lg:col-span-2">
              <Card className="border-[var(--border)]" style={{ borderRadius: "12px" }}>
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {[
                    {
                      label: "Address",
                      value: address,
                      icon: <MapPin className="w-5 h-5 text-gray-600" strokeWidth={1.5} />,
                    },
                    {
                      label: "Email",
                      value: (
                        <>
                          <a href={`mailto:${email}`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors block">{email}</a>
                          <a href={`mailto:${emailAlt}`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors mt-0.5 block">{emailAlt}</a>
                        </>
                      ),
                      icon: <Mail className="w-5 h-5 text-gray-600" strokeWidth={1.5} />,
                    },
                    {
                      label: "Phone / WhatsApp",
                      value: <><p className="text-sm text-gray-500">Phone: {phone}</p><p className="text-sm text-gray-500 mt-0.5">WhatsApp: {whatsapp}</p></>,
                      icon: <Phone className="w-5 h-5 text-gray-600" strokeWidth={1.5} />,
                    },
                    {
                      label: "Business Hours",
                      value: <p className="text-sm text-gray-500">{COMPANY.contact.hours}</p>,
                      icon: <Clock className="w-5 h-5 text-gray-600" strokeWidth={1.5} />,
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-4">
                      <div className="w-11 h-11 shrink-0 bg-gray-100 flex items-center justify-center" style={{ borderRadius: "12px" }}>
                        {item.icon}
                      </div>
                      <div>
                        <Badge variant="secondary" className="mb-1">{item.label}</Badge>
                        {typeof item.value === "string" ? (
                          <p className="text-sm md:text-base text-gray-500 leading-relaxed">{item.value}</p>
                        ) : item.value}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* 右栏 —— 询盘表单 */}
            <div className="lg:col-span-3">
              <InquiryForm />
            </div>
          </div>
        </div>
      </section>

      {/* 地图（Leaflet + Esri 卫星影像，零 key、国内外可访问） */}
      <section className="bg-white py-10 md:py-14">
        <div className="site-container min-w-0">
          {/* 地图上方：在地图中查看 / 导航（AMap / Google） */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">View / Navigate:</span>
            <a
              href={`https://uri.amap.com/marker?position=${COMPANY.contact.lng},${COMPANY.contact.lat}&name=${encodeURIComponent(address)}&src=sonida&coordinate=wgs84&callnative=1`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
            >
              <MapPin aria-hidden="true" />
              AMap View
            </a>
            <a
              href={`https://uri.amap.com/navigation?to=${COMPANY.contact.lng},${COMPANY.contact.lat},${encodeURIComponent(address)}&mode=car&policy=1&src=sonida&coordinate=wgs84&callnative=1`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Navigation aria-hidden="true" />
              AMap Navigate
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${gmap.lat},${gmap.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
            >
              <MapPin aria-hidden="true" />
              Google View
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${gmap.lat},${gmap.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Navigation aria-hidden="true" />
              Google Navigate
            </a>
          </div>

          <div
            className="h-[280px] w-full min-w-0 overflow-hidden rounded-2xl border border-[#D0D1D2] bg-gray-200 md:h-auto md:aspect-[21/9]"
          >
            <ContactMap
              lat={COMPANY.contact.lat}
              lng={COMPANY.contact.lng}
              address={address}
            />
          </div>
        </div>
      </section>
    </>
  );
}
