"use client"

/*
 * Separator —— 分隔线 UI 原语
 * 基于 @base-ui/react 的 Separator 原语封装，属于 shadcn 风格基础组件。
 * 主要职责：在内容间绘制水平/垂直分隔线；orientation 默认 "horizontal"。
 */

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

// Separator：data-horizontal / data-vertical 由 orientation 决定显示方向。
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
