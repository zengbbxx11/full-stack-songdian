/*
 * 布局：认证页面布局（signin/signup 路由组）
 * 职责：提供全屏居中布局 + 主题切换按钮（右下角固定）。包裹 ThemeProvider 保证子组件能读写主题。
 * 与 (admin)/layout 互斥——登录页不走侧边栏。
 */
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import { ThemeProvider } from "@/context/ThemeContext";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex w-full h-screen justify-center items-center dark:bg-gray-900">
          {children}
          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
