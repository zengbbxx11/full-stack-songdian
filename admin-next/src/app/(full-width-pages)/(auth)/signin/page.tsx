/*
 * 页面：管理后台登录页（/signin）
 * 职责：渲染 SignInForm 登录表单，提交 admin / password 到后端 /api/v1/admin/login。
 * 此页面走 full-width 布局（无侧边栏），middleware 不会拦截此路由。
 */
import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 | 松典管理后台",
  description: "登录松典科技管理后台",
};

export default function SignIn() {
  return <SignInForm />;
}
