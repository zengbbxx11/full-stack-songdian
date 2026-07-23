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
import ContactMap from "@/components/ContactMap";
import InquiryForm from "@/components/form/InquiryForm";
import { generateBreadcrumbs, localBusinessSchema } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wgs84ToGcj02 } from "@/lib/coord-transform";
import { MapPin, Navigation } from "lucide-react";

export const metadata = await superMeta({
  title: "Contact Us",
  description: `Get in touch with ${COMPANY.name}. Request a quote for OEM/ODM camera manufacturing — our team responds within 24 hours.`,
  url: "/contact",
});

// ISR 重新验证间隔（秒）：静态内容每小时刷新一次
export const revalidate = 3600;

export default function ContactPage() {
  const breadcrumbs = generateBreadcrumbs([{ label: "Contact" }]);
  const businessSchema = localBusinessSchema();

  // 高德传 WGS-84 并自动转 GCJ-02；Google 中国底图为 GCJ-02，
  // 故 Google 链接需先用 WGS-84 坐标换算成 GCJ-02，才能与高德落在同一点。
  const gmap = wgs84ToGcj02(COMPANY.contact.lat, COMPANY.contact.lng);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessSchema) }}
      />

      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 主内容区 */}
      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">

            {/* 左栏 */}
            <div className="lg:col-span-2">
              <Card className="border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
                <CardHeader>
                  <CardTitle className="text-xl font-bold text-gray-900 tracking-tight">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {[
                    {
                      label: "Address",
                      value: COMPANY.contact.address,
                      icon: <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
                    },
                    {
                      label: "Email",
                      value: (
                        <>
                          <a href={`mailto:${COMPANY.contact.email}`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors block">{COMPANY.contact.email}</a>
                          <a href={`mailto:${COMPANY.contact.emailAlt}`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors mt-0.5 block">{COMPANY.contact.emailAlt}</a>
                        </>
                      ),
                      icon: <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
                    },
                    {
                      label: "Phone / WhatsApp",
                      value: <><p className="text-sm text-gray-500">Phone: {COMPANY.contact.phone}</p><p className="text-sm text-gray-500 mt-0.5">WhatsApp: {COMPANY.contact.whatsapp}</p></>,
                      icon: <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>,
                    },
                    {
                      label: "Business Hours",
                      value: <p className="text-sm text-gray-500">{COMPANY.contact.hours}</p>,
                      icon: <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-4">
                      <div className="w-11 h-11 shrink-0 bg-gray-100 flex items-center justify-center" style={{ borderRadius: "12px" }}>
                        {item.icon}
                      </div>
                      <div>
                        <Badge variant="secondary" className="mb-1">{item.label}</Badge>
                        {typeof item.value === "string" ? (
                          <p className="text-sm text-gray-500 leading-relaxed">{item.value}</p>
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
      <section className="py-4 bg-gray-50 border-t border-[#EEEEEE]">
        <div className="max-w-7xl mx-auto px-6">
          {/* 地图上方：在地图中查看 / 导航（AMap / Google） */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">View / Navigate:</span>
            <a
              href={`https://uri.amap.com/marker?position=${COMPANY.contact.lng},${COMPANY.contact.lat}&name=${encodeURIComponent(COMPANY.contact.address)}&src=sonida&coordinate=wgs84&callnative=1`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
            >
              <MapPin aria-hidden="true" />
              AMap View
            </a>
            <a
              href={`https://uri.amap.com/navigation?to=${COMPANY.contact.lng},${COMPANY.contact.lat},${encodeURIComponent(COMPANY.contact.address)}&mode=car&policy=1&src=sonida&coordinate=wgs84&callnative=1`}
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
            className="aspect-[21/9] min-h-[280px] overflow-hidden bg-gray-200 border border-[#D0D1D2]"
            style={{ borderRadius: "12px" }}
          >
            <ContactMap
              lat={COMPANY.contact.lat}
              lng={COMPANY.contact.lng}
              address={COMPANY.contact.address}
            />
          </div>
        </div>
      </section>
    </>
  );
}
