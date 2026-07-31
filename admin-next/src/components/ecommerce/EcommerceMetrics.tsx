"use client";
import React from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import type { Paginated, ProductCategory, Inquiry } from "@/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface CountryItem { country: string; count: number; }
interface StatsData {
  inquiry_countries: CountryItem[];
  inquiry_status: Record<string, number>;
}

export default function EcommerceMetrics() {
  // 计数用独立端点（保证可用）
  const { data: productsData, isLoading: pL } = useSWR<Paginated<unknown>>("/products?page_size=1", swrFetcher);
  const { data: newsData, isLoading: nL } = useSWR<Paginated<unknown>>("/news?page_size=1", swrFetcher);
  const { data: catsData, isLoading: cL } = useSWR<Paginated<ProductCategory>>("/admin/categories?page_size=50", swrFetcher);
  const { data: inquiriesData, isLoading: iL } = useSWR<Paginated<Inquiry>>("/admin/inquiries?page_size=8", swrFetcher);
  // 统计走新端点
  const { data: stats, isLoading: sL } = useSWR<StatsData>("/admin/stats", swrFetcher);

  const loading = pL || nL || cL || iL || sL;

  const products = productsData?.total ?? 0;
  const news = newsData?.total ?? 0;
  const categories = catsData?.list?.length ?? 0;
  const inquiries = inquiriesData?.total ?? 0;

  const countries = stats?.inquiry_countries ?? [];
  const statusDist = stats?.inquiry_status ?? {};
  const categoryStats = (catsData?.list ?? []).map(c => ({ name: c.name, count: c.product_count ?? 0 }));
  const recentInquiries = inquiriesData?.list ?? [];

  const cards = [
    { label: "产品", value: products, color: "bg-blue-500" },
    { label: "新闻", value: news, color: "bg-green-500" },
    { label: "分类", value: categories, color: "bg-purple-500" },
    { label: "询盘", value: inquiries, color: "bg-amber-500" },
  ];

  const pieOptions = {
    labels: categoryStats.map(c => c.name),
    colors: ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"],
    legend: { position: "bottom" as const, labels: { colors: "#6B7280" } },
    plotOptions: { pie: { donut: { size: "60%" } } },
  };

  const statusLabels: Record<string, string> = { NEW: "新询盘", CONTACTING: "联系中", QUOTED: "已报价", DEAL: "成交", LOST: "丢单" };
  const statusColors: Record<string, string> = { NEW: "bg-blue-100 text-blue-700", CONTACTING: "bg-indigo-100 text-indigo-700", QUOTED: "bg-purple-100 text-purple-700", DEAL: "bg-green-100 text-green-700", LOST: "bg-gray-100 text-gray-600" };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                {loading ? <div className="h-4 w-8 animate-pulse rounded bg-white/40" /> : <span className="text-lg font-bold text-white">{card.value}</span>}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 询盘来源 + 状态分布 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 询盘来源国家（Top 10） */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
            询盘国家分布
            <span className="ml-2 text-xs font-normal text-gray-400">（询盘表单填写的国家字段，按数量排序）</span>
          </h3>
          {countries.length > 0 ? (
            <div className="space-y-2">
              {countries.map((c, i) => (
                <div key={c.country} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right text-xs text-gray-400">{i + 1}</span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{c.country === "Unknown" ? "未知" : c.country}</span>
                  <span className="font-medium text-gray-900 dark:text-white w-8 text-right">{c.count}</span>
                  <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.count / countries[0].count) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="py-8 text-center text-sm text-gray-400">暂无询盘数据</div>}
        </div>

        {/* 询盘状态分布 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">询盘状态分布</h3>
          <div className="space-y-4">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusColors[key] || "bg-gray-100 text-gray-600"}`}>{label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${inquiries ? ((statusDist[key] ?? 0) / inquiries) * 100 : 0}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-8 text-right">{statusDist[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 产品分类 + 最近询盘 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">产品分类</h3>
          {categoryStats.length > 0 ? <Chart options={pieOptions} series={categoryStats.map(c => c.count)} type="donut" height={280} />
            : <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">暂无数据</div>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">最近询盘</h3>
          {recentInquiries.length === 0 ? <div className="py-8 text-center text-sm text-gray-400">暂无询盘</div> :
            <div className="space-y-2">
              {recentInquiries.map(inq => (
                <div key={inq.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 dark:border-gray-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm text-gray-800 dark:text-white/90 truncate">{inq.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[inq.status] || "bg-gray-100"}`}>{statusLabels[inq.status] || inq.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{inq.email}{inq.company ? ` · ${inq.company}` : ""}</p>
                    <p className="text-xs text-gray-400 truncate">{inq.message}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{inq.created_time ? new Date(inq.created_time).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "-"}</span>
                </div>
              ))}
            </div>}
        </div>
      </div>
    </div>
  );
}
