"use client";

/*
 * 文件：components/CtaButton.tsx
 * 职责：InteractiveHoverButton 的「导航版」客户端包装。
 * 因官网多数页面是 Server Component，无法直接给 InteractiveHoverButton 传 onClick，
 * 故在此客户端组件内处理跳转（window.location.href，与 Hero/HomeCta/Header 行为一致）。
 * 供各页面的转化 CTA（Inquiry / Quote / Contact）复用，统一红底悬停风格。
 */

import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

interface CtaButtonProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  fill?: string;
}

export function CtaButton({ href, children, className, fill = "bg-[#d4343e]" }: CtaButtonProps) {
  return (
    <InteractiveHoverButton
      onClick={() => { window.location.href = href; }}
      fill={fill}
      className={className}
    >
      {children}
    </InteractiveHoverButton>
  );
}
