import { Outfit } from 'next/font/google';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import SWRProvider from '@/context/SWRProvider';

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
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
