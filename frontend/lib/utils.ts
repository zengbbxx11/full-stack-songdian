// 样式类名合并工具：组合 clsx 与 tailwind-merge
// clsx 负责条件类名拼接，tailwind-merge 负责合并冲突的 Tailwind 类（后者覆盖前者）
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// 合并多个类名（支持字符串、数组、条件对象），并消除 Tailwind 样式冲突
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
