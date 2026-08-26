/*
 * AnimatedSection —— 滚动触发的入场动画包装组件（项目自定义）
 * 首页区块直接输出服务端 HTML，避免为装饰性入场动画加载客户端动画运行时。
 */

import type { ReactNode } from "react";

/**
 * AnimatedSection 包装组件的 Props。
 */
interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
}

/**
 * AnimatedSection — 保留首页区块的统一结构，不产生客户端 hydration。
 * @param children   - 要动画显示的内容
 * @param className  - 额外的 CSS 类名
 */
export default function AnimatedSection({
  children,
  className = "",
}: AnimatedSectionProps) {
  return <div className={className}>{children}</div>;
}
