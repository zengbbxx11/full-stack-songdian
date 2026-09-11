import './globals.css';
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import SWRProvider from '@/context/SWRProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning：浏览器扩展（以及任何在 React 加载前修改 <html> 的脚本）
    // 会给 <html> 追加 data-theme、style 之类属性，导致 React 报 hydration mismatch。
    // 这类改动发生在应用之外、无法在应用侧修复，且该 prop 只作用于 <html> 自身的属性，
    // 不会掩盖子树里的真实 mismatch。官网 layout 已做同样处理，此处保持一致。
    <html lang="en" suppressHydrationWarning>
      <body className="font-outfit dark:bg-gray-900">
        <ThemeProvider>
          <ToastProvider>
            <SidebarProvider>
              {/* SWR 全局配置（issue #23）：统一 fetcher + 关闭聚焦自动重校，详见 SWRProvider。 */}
              <SWRProvider>{children}</SWRProvider>
            </SidebarProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
