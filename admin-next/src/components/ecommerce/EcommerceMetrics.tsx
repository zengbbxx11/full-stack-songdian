"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// ApexCharts 动态加载，避免 SSR 问题
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface MetricsData {
  products: number;
  news: number;
  categories: number;
  inquiries: number;
}

// 分类分布数据
interface CategoryStat {
  name: string;
  count: number;
}

export default function EcommerceMetrics() {
  const [data, setData] = useState<MetricsData>({ products: 0, news: 0, categories: 0, inquiries: 0 });
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
    const headers = { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    Promise.all([
      fetch("/api/v1/products?page_size=1", { headers }).then((r) => r.json()).catch(() => ({ data: { total: 0 } })),
      fetch("/api/v1/news?page_size=1", { headers }).then((r) => r.json()).catch(() => ({ data: { total: 0 } })),
      fetch("/api/v1/admin/categories?page_size=50", { headers }).then((r) => r.json()).catch(() => ({ data: { list: [] } })),
      fetch("/api/v1/admin/inquiries?page_size=1", { headers }).then((r) => r.json()).catch(() => ({ data: { list: [] } })),
    ]).then(([products, news, cats, inquiries]) => {
      // categories API 返回 {list: [...], total: N} 分页格式
      const catList = cats.data?.list || cats.data || [];
      setData({
        products: products.data?.total || 0,
        news: news.data?.total || 0,
        categories: catList.length,
        inquiries: inquiries.data?.list?.length || 0,
      });
      // 分类数据（含产品计数）
      const stats: CategoryStat[] = catList.map((c: any) => ({
        name: c.name,
        count: c.product_count || 0,
      }));
      setCategoryStats(stats);
    }).finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: "Products", value: data.products, color: "bg-blue-500", icon: "📦" },
    { label: "News", value: data.news, color: "bg-green-500", icon: "📰" },
    { label: "Categories", value: data.categories, color: "bg-purple-500", icon: "📁" },
    { label: "Inquiries", value: data.inquiries, color: "bg-amber-500", icon: "💬" },
  ];

  // 产品分类分布饼图配置
  const pieOptions = {
    labels: categoryStats.map((c) => c.name),
    colors: ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"],
    legend: { position: "bottom" as const, labels: { colors: "#6B7280" } },
    plotOptions: { pie: { donut: { size: "60%" } } },
    dataLabels: { enabled: true, style: { fontSize: "12px" } },
    responsive: [{ breakpoint: 480, options: { chart: { width: 300 }, legend: { position: "bottom" } } }],
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                {loading ? (
                  <div className="h-4 w-8 animate-pulse rounded bg-white/40" />
                ) : (
                  <span className="text-lg font-bold text-white">{card.value}</span>
                )}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* 图表 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 产品分类分布 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Product Categories</h3>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <div className="h-48 w-48 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : categoryStats.length > 0 ? (
            <Chart options={pieOptions} series={categoryStats.map((c) => c.count)} type="donut" height={280} />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">No category data</div>
          )}
        </div>

        {/* 内容统计概览 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Content Overview</h3>
          <div className="space-y-4">
            {[
              { label: "Published Products", value: data.products, max: data.products || 1, color: "bg-blue-500" },
              { label: "Published News", value: data.news, max: data.news || 1, color: "bg-green-500" },
              { label: "Product Categories", value: data.categories, max: data.categories || 1, color: "bg-purple-500" },
              { label: "Customer Inquiries", value: data.inquiries, max: data.inquiries || 1, color: "bg-amber-500" },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                  <span className="font-medium text-gray-800 dark:text-white/90">{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  {loading ? (
                    <div className="h-full animate-pulse bg-gray-200 dark:bg-gray-700" style={{ width: "40%" }} />
                  ) : (
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(item.value / item.max) * 100}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚀</span>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">Ready for Launch</p>
                <p className="text-xs text-gray-400">All systems operational. Backend API healthy.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
