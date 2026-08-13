"use client";

/*
 * 文件：components/CtaButton.tsx
 * 职责：InteractiveHoverButton 的「导航版」客户端包装。
 * 因官网多数页面是 Server Component，无法直接给 InteractiveHoverButton 传 onClick，
 * 故在此客户端组件内用 Next Router 处理站内跳转。
 * 供各页面的转化 CTA（Inquiry / Quote / Contact）复用，统一红底悬停风格。
 */

import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { trackEvent } from "@/lib/analytics";
import { useRouter } from "next/navigation";

interface CtaButtonProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  fill?: string;
  /** GA4 事件标签，用于区分不同位置的 CTA。不传则不打点。 */
  ctaLabel?: string;
}

export function CtaButton({ href, children, className, fill = "bg-[#d4343e]", ctaLabel }: CtaButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (ctaLabel) {
      trackEvent("cta_click", { cta_label: ctaLabel, destination: href });
    }
    router.push(href);
  }

  return (
    <InteractiveHoverButton
      onClick={handleClick}
      fill={fill}
      className={className}
    >
      {children}
    </InteractiveHoverButton>
  );
}
