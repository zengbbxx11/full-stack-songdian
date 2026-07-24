/*
 * 页面：产品分类管理页（/categories）
 * 职责：产品分类的 CRUD（增删改查）。从后端 /api/v1/admin/categories 获取分类列表，
 * 支持新建分类、编辑名称/别名、删除（实时刷新）。分类数据用于产品页的分类筛选下拉。
 */
"use client";
import React, { useEffect, useState } from "react";

interface Cat { id: number; name: string; slug: string; count: number; }

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function CategoriesPage() {
  const [items, setItems] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) { setError("Please sign in first"); setLoading(false); return; }

    const authHeaders = { Accept: "application/json", Authorization: `Bearer ${token}` };

    // 分类（需要 token）+ 产品列表（公开接口，不需要 token）
    Promise.all([
      fetch("/api/v1/admin/categories?page_size=50", { headers: authHeaders }).then(r => r.json()),
      fetch("/api/v1/products?page_size=200", { headers: { Accept: "application/json" } }).then(r => r.json()),
    ]).then(([catJson, prodJson]) => {
      if (catJson.code !== "0") { setError(catJson.msg); return; }

      // 统计每个分类的产品数
      const products = prodJson.data?.list || [];
      const countMap: Record<number, number> = {};
      products.forEach((p: { category: { id: number } | null }) => {
        const cid = p.category?.id;
        if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
      });

      const cats = (catJson.data?.list || []).map((c: Cat) => ({
        ...c,
        count: countMap[c.id] || 0,
      }));
      setItems(cats);
    }).catch(() => setError("Network error"))
    .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">Categories</h2>

      {loading ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slug</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {items.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No categories found</td></tr>
              ) : items.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.slug}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${c.count > 0 ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400" : "bg-gray-100 text-gray-500"}`}>
                      {c.count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
