"use client";

/*
 * 文件：components/HomeCtaSection.tsx
 * 职责：首页底部 CTA 区块（客户端组件）。
 * 因内部包含 InteractiveHoverButton 的 onClick 交互，
 * 必须作为 Client Component 独立于 Server Component 的 page.tsx 之外。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import AnimatedSection from "@/components/motion/AnimatedSection";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { trackEvent } from "@/lib/analytics";

export default function HomeCtaSection() {
  const router = useRouter();

  function handleInquiryClick() {
    trackEvent("cta_click", { cta_label: "Home - Send an Inquiry", destination: "/contact" });
    router.push("/contact");
  }

  return (
    <AnimatedSection>
      <section className="relative overflow-hidden bg-[#111316] py-20 md:py-32">
        <div className="absolute inset-0 opacity-20 tech-grid" aria-hidden="true" />
        <div className="site-container relative text-center">
          <p className="section-eyebrow">OEM / ODM partnership</p>
          <h2 className="mx-auto mb-5 mt-5 max-w-3xl text-[clamp(2.4rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-white">
            Ready to Start Your Camera Project?
          </h2>
          <p className="mx-auto mb-9 max-w-xl text-base leading-relaxed text-white/55 md:text-lg">
            Whether you need OEM manufacturing or full ODM product development, our team is ready to help.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <InteractiveHoverButton
              onClick={handleInquiryClick}
              fill="bg-[#d4343e]"
              className="h-12 border-[#d4343e] bg-white px-8 text-[14px] text-[#171A20] hover:text-white"
            >
              Send an Inquiry
            </InteractiveHoverButton>
            <Link
              href="/about"
              className="inline-flex h-12 items-center rounded-xl border border-white/25 bg-transparent px-8 text-sm font-medium text-white transition-colors duration-[330ms] hover:border-white hover:bg-white hover:text-[#111316]"
            >
              About Us
            </Link>
          </div>
        </div>
      </section>
    </AnimatedSection>
  );
}
