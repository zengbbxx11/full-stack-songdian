/*
 * 页面：管理后台首页（Dashboard /admin -> /）
 * 职责：展示管理后台仪表盘，当前仅渲染 EcommerceMetrics 卡片组件。
 * 此页面受 middleware 路由守卫保护，未登录会自动跳转到 /signin。
 */
import type { Metadata } from "next";
import EcommerceMetrics from "@/components/ecommerce/EcommerceMetrics";

export const metadata: Metadata = {
  title: "仪表盘 | 松典管理后台",
  description: "松典科技管理后台仪表盘",
};

export default function Dashboard() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">
        仪表盘
      </h2>
      <EcommerceMetrics />
    </div>
  );
}
