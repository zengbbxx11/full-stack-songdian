"use client";

/*
 * 文件：components/ui/interactive-hover-button.tsx
 * 来源：Magic UI — InteractiveHoverButton
 * 功能：交互式悬停按钮，hover 时圆点扩散 + 文字滑出 + 箭头滑入的动效组合。
 *
 * 依赖：
 *   - lucide-react（ArrowRight 图标，项目已安装）
 *   - @/lib/utils 的 cn()（shadcn 标准类名合并）
 */

import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** hover 时放大填满按钮的圆点/填充色，默认 bg-primary（品牌蓝）。传 bg-[#xxx] 可换色 */
  fill?: string;
}

export function InteractiveHoverButton({
  children,
  className,
  fill = "bg-primary",
  ...props
}: InteractiveHoverButtonProps) {
  return (
    <button
      className={cn(
        "group bg-background relative w-auto cursor-pointer overflow-hidden rounded-xl border p-2 px-6 text-center font-semibold",
        className
      )}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        <span>{children}</span>
        <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          fill,
          "absolute inset-0 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        )}
      />
    </button>
  );
}
