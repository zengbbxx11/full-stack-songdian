"use client";

/*
 * 文件：components/HomeCtaSection.tsx
 * 职责：首页底部 CTA 区块（客户端组件）。
 * 因内部包含 InteractiveHoverButton 的 onClick 交互，
 * 必须作为 Client Component 独立于 Server Component 的 page.tsx 之外。
 */

import Link from "next/link";
import AnimatedSection from "@/components/motion/AnimatedSection";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

export default function HomeCtaSection() {
  return (
    <AnimatedSection>
      <section className="py-16 md:py-24" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-white tracking-tight mb-4" style={{ fontSize: "30px", fontWeight: 500, color: "#FFFFFF" }}>
            Ready to Start Your Camera Project?
          </h2>
          <p className="max-w-lg mx-auto mb-8" style={{ color: "#8E8E8E" }}>
            Whether you need OEM manufacturing or full ODM product development, our team is ready to help.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <InteractiveHoverButton
              onClick={() => window.location.href = "/contact"}
              fill="bg-[#d4343e]"
              className="border-[#d4343e] bg-white text-[#171A20] shadow-sm h-[44px] px-8 text-[14px]"
            >
              Send an Inquiry
            </InteractiveHoverButton>
            <Link
              href="/about"
              className="inline-flex items-center px-8 text-sm font-medium rounded transition-colors bg-transparent hover:bg-white/10"
              style={{ fontSize: "14px", fontWeight: 500, color: "#FFFFFF", height: "44px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.2)", transitionDuration: "0.33s" }}
            >
              About Us
            </Link>
          </div>
        </div>
      </section>
    </AnimatedSection>
  );
}
