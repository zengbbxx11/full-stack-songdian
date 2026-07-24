/*
 * 布局：全宽页面布局（登录/注册等无侧边栏页面）
 * 职责：包裹 signin 等认证页面，与 (admin)/layout 互斥，不包含 AppSidebar/AppHeader。
 * 子组件（如 auth layout）自行管理 ThemeProvider 和主题切换。
 */
export default function FullWidthPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
