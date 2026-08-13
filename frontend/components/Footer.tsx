import Link from "next/link";
import Image from "next/image";
import { COMPANY, FOOTER_LINKS, SOCIAL_LINKS } from "@/lib/site-config";
import { MEDIA } from "@/lib/media";
import CookieSettingsTrigger from "@/components/CookieSettingsTrigger";

/**
 * 极简 Tesla 页脚
 * ------------------------------------------------------------------
 * Light Ash 背景（#F4F4F4），极细顶部分割线。
 * 列标题 uppercase，链接 Pewter 色，底部 Silver Fog 版权。
 * Server Component — hover 效果全部由 CSS 处理。
 */

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-black/8 bg-[#f3f4f5] text-[#171A20]">
      <div className="site-container py-20 md:py-24">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* 品牌列 */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Image
                src={MEDIA.logo}
                alt={COMPANY.name}
                width={128}
                height={32}
                className="h-8 w-auto"
                unoptimized
              />
            </Link>
            <div className="flex items-center gap-4 mb-4">
              {SOCIAL_LINKS.map((s) => {
                const url = s.url;
                const interactive = Boolean(url);
                const img = (
                  <Image
                    src={s.icon}
                    alt={s.name}
                    width={20}
                    height={20}
                    className="h-5 w-5 transition-opacity duration-[330ms]"
                    style={{ opacity: interactive ? 0.7 : 0.4 }}
                    unoptimized
                  />
                );
                if (!url) {
                  return (
                    <span key={s.name} aria-label={s.name} title={`${s.name} — coming soon`}>
                      {img}
                    </span>
                  );
                }
                return (
                  <a
                    key={s.name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.name}
                    className="group"
                  >
                    {img}
                  </a>
                );
              })}
            </div>
            <p className="mb-4 max-w-xs text-[13px] leading-relaxed text-[#666b72]">
              {COMPANY.description}
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center text-[13px] font-medium text-[#171A20] transition-colors duration-[330ms] hover:text-[#d4343e]"
            >
              Get in touch
              <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* 链接列通用组件 */}
          {[
            { title: "Products", links: FOOTER_LINKS.products },
            { title: "Solutions", links: FOOTER_LINKS.services },
            { title: "Company", links: FOOTER_LINKS.company },
            { title: "Support", links: FOOTER_LINKS.support },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#171A20]">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] font-normal text-[#666b72] transition-colors duration-[330ms] hover:text-[#d4343e]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 底部栏 */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-black/10 pt-8 sm:flex-row">
          <p className="text-[14px] text-[#777b81]">
            &copy; {year} {COMPANY.fullName}. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <Link href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="text-[14px] text-[#777b81] transition-colors duration-[330ms] hover:text-[#171A20]">
              Sitemap
            </Link>
            <Link href="/privacy-policy" className="text-[14px] text-[#777b81] transition-colors duration-[330ms] hover:text-[#171A20]">
              Privacy
            </Link>
            <CookieSettingsTrigger />
            <Link href="/solutions/faq" className="text-[14px] text-[#777b81] transition-colors duration-[330ms] hover:text-[#171A20]">
              FAQ
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
