"use client"

/*
 * Label —— 表单标签 UI 原语（纯 React 组件，无 Radix 依赖）
 * 主要职责：为表单控件提供文字标签；通过 group/peer 状态联动禁用（disabled）样式。
 */

import * as React from "react"

import { cn } from "@/lib/utils"

// Label：关联控件禁用时自动置灰且禁止交互。
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
