"use client";
import React from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import type { Paginated, ProductCategory, Inquiry } from "@/types";

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
  // 使用 SWR 获取各项数据
  const { data: productsData, isLoading: productsLoading } = useSWR<Paginated<unknown>>(
    "/products?page_size=1",
    swrFetcher,
  );
  const { data: newsData, isLoading: newsLoading } = useSWR<Paginated<unknown>>(
    "/news?page_size=1",
    swrFetcher,
  );
  const { data: catsData, isLoading: catsLoading } = useSWR<Paginated<ProductCategory>>(
    "/admin/categories?page_size=50",
    swrFetcher,
  );
  const { data: inquiriesData, isLoading: inquiriesLoading } = useSWR<Paginated<Inquiry>>(
    "/admin/inquiries?page_size=5",
    swrFetcher,
  );

  const loading = productsLoading || newsLoading || catsLoading || inquiriesLoading;

  // 构建 metrics 数据
  const data: MetricsData = {
    products: productsData?.total ?? 0,
    news: newsData?.total ?? 0,
    categories: catsData?.list?.length ?? 0,
    inquiries: inquiriesData?.total ?? 0,
  };

  // 分类数据（含产品计数）
  const categoryStats: CategoryStat[] = (catsData?.list ?? []).map((c) => ({
    name: c.name,
    count: c.product_count ?? 0,
  }));

  // 最近询盘
  const recentInquiries = inquiriesData?.list ?? [];

  const cards = [
    { label: "产品", value: data.products, color: "bg-blue-500", icon: "📦" },
    { label: "新闻", value: data.news, color: "bg-green-500", icon: "📰" },
    { label: "分类", value: data.categories, color: "bg-purple-500", icon: "📁" },
    { label: "询盘", value: data.inquiries, color: "bg-amber-500", icon: "💬" },
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

  // 格式化时间
  function formatTime(time: string | null): string {
    if (!time) return "-";
    return new Date(time).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // 询盘状态标签
  function inquiryStatusBadge(status: string) {
    switch (status) {
      case "NEW": return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">新</span>;
      case "REPLIED": return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">已回复</span>;
      case "ARCHIVED": return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">已归档</span>;
      default: return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{status}</span>;
    }
  }

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
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">产品分类</h3>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <div className="h-48 w-48 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : categoryStats.length > 0 ? (
            <Chart options={pieOptions} series={categoryStats.map((c) => c.count)} type="donut" height={280} />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">暂无分类数据</div>
          )}
        </div>

        {/* 内容统计概览 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">内容概览</h3>
          <div className="space-y-4">
            {[
              { label: "已发布产品", value: data.products, max: data.products || 1, color: "bg-blue-500" },
              { label: "已发布新闻", value: data.news, max: data.news || 1, color: "bg-green-500" },
              { label: "产品分类", value: data.categories, max: data.categories || 1, color: "bg-purple-500" },
              { label: "客户询盘", value: data.inquiries, max: data.inquiries || 1, color: "bg-amber-500" },
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
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">准备上线</p>
                <p className="text-xs text-gray-400">所有系统运行正常，后端 API 健康。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 最近询盘 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">最近询盘</h3>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : recentInquiries.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">暂无询盘</div>
        ) : (
          <div className="space-y-3">
            {recentInquiries.map((inq) => (
              <div key={inq.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-800 dark:text-white/90 truncate">{inq.name}</span>
                    {inquiryStatusBadge(inq.status)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{inq.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{inq.message}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatTime(inq.created_time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
