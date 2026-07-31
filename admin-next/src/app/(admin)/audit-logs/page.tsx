/*
 * 页面：操作审计日志（/audit-logs）
 * 职责：展示后台所有操作记录 — 谁、何时、做了什么、结果如何。
 * 数据源：GET /api/v1/admin/audit-logs（分页 + RBAC 保护）。
 */
"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/api-client";
import type { Paginated } from "@/types";

interface AuditLog {
  id: number;
  username: string;
  action: string;
  resource: string;
  result: string;
  ip: string;
  created_time: string;
}

const ACTION_LABELS: Record<string, string> = {
  "product.create": "创建产品", "product.update": "更新产品", "product.delete": "删除产品",
  "news.create": "创建新闻", "news.update": "更新新闻", "news.delete": "删除新闻",
  "inquiry.status.update": "询盘状态变更", "inquiry.assign": "分配询盘", "inquiry.follow_note": "跟进询盘",
  "inquiry.delete": "删除询盘",
  "admin.login": "登录",
};

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");

  const key = `/admin/audit-logs?page=${page}&page_size=50`;
  const { data, isLoading } = useSWR<Paginated<AuditLog>>(key, swrFetcher);

  const items = data?.list ?? [];
  const total = data?.total ?? 0;
  const filtered = filter ? items.filter(i => i.action.includes(filter) || i.username.includes(filter) || i.resource.includes(filter)) : items;

  function formatTime(t: string) {
    return new Date(t).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">操作审计</h2>
        <span className="text-sm text-gray-400">共 {total} 条</span>
      </div>

      <div className="mb-4">
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="搜索操作 / 用户名 / 资源..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 lg:w-96"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">用户</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">资源</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">结果</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" style={{ width: "60%" }} /></td></tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{filter ? "无匹配记录" : "暂无操作记录"}</td></tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatTime(log.created_time)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90 text-xs">{log.username}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono max-w-[200px] truncate">{log.resource}</td>
                  <td className="px-4 py-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${log.result === "SUCCESS" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {log.result === "SUCCESS" ? "成功" : "失败"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ip}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 50 && (
        <div className="mt-4 flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-30">上一页</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">第 {page} 页 / 共 {Math.ceil(total / 50)} 页</span>
          <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-30">下一页</button>
        </div>
      )}
    </div>
  );
}
