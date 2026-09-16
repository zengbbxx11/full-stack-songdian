"use client";

/*
 * 文件：components/CtaButton.tsx
 * 职责：InteractiveHoverLink 的「导航版」客户端包装。
 * 因官网多数页面是 Server Component，无法直接给 InteractiveHoverLink 传 onClick，
 * 故在此客户端组件内记录点击事件，导航由真实链接处理。
 * 供各页面的转化 CTA（Inquiry / Quote / Contact）复用，统一红底悬停风格。
 */

import { InteractiveHoverLink } from "@/components/ui/interactive-hover-button";
import { trackEvent } from "@/lib/analytics";

interface CtaButtonProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  fill?: string;
  /** GA4 事件标签，用于区分不同位置的 CTA。不传则不打点。 */
  ctaLabel?: string;
}

export function CtaButton({ href, children, className, fill = "bg-[var(--accent)]", ctaLabel }: CtaButtonProps) {

  function handleClick() {
    if (ctaLabel) {
      trackEvent("cta_click", { cta_label: ctaLabel, destination: href });
    }
  }

  return (
    <InteractiveHoverLink
      href={href}
      onClick={handleClick}
      fill={fill}
      className={className}
    >
      {children}
    </InteractiveHoverLink>
  );
}
