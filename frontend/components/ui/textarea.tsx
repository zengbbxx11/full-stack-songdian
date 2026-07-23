/*
 * Textarea —— 多行文本输入框 UI 原语（纯 React 组件，无 Radix 依赖）
 * 主要职责：多行文本输入；使用 field-sizing-content 实现内容自适应高度，
 * 并统一处理 focus、disabled、校验错误（aria-invalid）等状态样式。
 */

import * as React from "react"

import { cn } from "@/lib/utils"

// Textarea：原生 <textarea> 封装，data-slot="textarea" 便于样式定位。
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
