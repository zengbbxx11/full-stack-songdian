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

import { ArrowRight } from "lucide-react";
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
        "group bg-background relative w-auto cursor-pointer overflow-hidden rounded-lg border p-2 px-6 text-center font-semibold",
        className
      )}
      {...props}
    >
      {/* 默认态：圆点 + 文字 */}
      <div className="flex items-center justify-center gap-2">
        <div className={cn(fill, "h-2 w-2 rounded-full transition-all duration-300 group-hover:scale-[100.8]")} />
        <span className="inline-block transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
          {children}
        </span>
      </div>
      {/* hover 态：文字 + 箭头（绝对定位覆盖） */}
      <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover:-translate-x-5 group-hover:opacity-100">
        <span>{children}</span>
        <ArrowRight />
      </div>
    </button>
  );
}
