/*
 * 页面：产品管理页（/products）
 * 职责：产品列表 CRUD + 拖拽排序。从后端 /api/v1/admin/products 获取数据，
 * 支持按关键词/分类筛选、拖拽调整排序、保存排序到后端、删除（需确认弹窗）。
 * 拖拽排序使用原生 HTML5 Drag & Drop（onDragStart/onDragOver/onDrop），
 * 本地维护排序状态后批量 POST 到 /api/v1/admin/products/reorder。
 */
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/context/ToastContext";

interface Product { id: number; title: string; slug: string; sku: string | null; stock_status: string; status: string; sort_order: number; cover_image: string | null; category: { id: number; name: string } | null; }
interface Cat { id: number; name: string; }

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ProductsPage() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; title: string } | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [original, setOriginal] = useState<Product[]>([]); // 保存原始顺序，用于取消还原
  const [categories, setCategories] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false); // 是否有未保存的排序变更

  // 加载分类列表
  useEffect(() => {
    const token = getToken();
    fetch("/api/v1/admin/categories?page_size=50", {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).then(r => r.json()).then(j => { if (j.code === "0") setCategories(j.data?.list || []); }).catch(() => {});
  }, []);

  // 加载产品
  useEffect(() => {
    setLoading(true);
    const token = getToken();
    const params = new URLSearchParams({ page_size: "100" });
    if (keyword) params.set("keyword", keyword);
    if (categoryId) params.set("category_id", categoryId);
    fetch(`/api/v1/products?${params}`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).then(r => r.json()).then(j => {
      const list = (j.data?.list || []) as Product[];
      // 按 sort_order 排序
      list.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
      setItems(list);
      setOriginal(list); // 保存原始顺序快照，供取消还原
      setDirty(false);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [keyword, categoryId]);

  async function handleDelete(id: number, title: string) {
    setConfirmTarget({ id, title });
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    const { id } = confirmTarget;
    const token = getToken();
    await fetch(`/api/v1/admin/products/${id}`, { method: "DELETE", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    setItems(prev => prev.filter(p => p.id !== id));
    toast.success("Product deleted");
    setConfirmOpen(false);
    setConfirmTarget(null);
  }

  // 拖拽开始
  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIdx(index);
    e.dataTransfer.effectAllowed = "move";
  }

  // 拖拽放置 —— 仅更新本地顺序，不立即保存
  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setItems(reordered);
    setDragIdx(null);
    setDirty(true); // 标记有未保存的变更
  }

  // 保存排序 —— 精准插入算法：只更新换位的产品，用邻居 sort_order 中点计算新值
  async function handleSaveOrder() {
    setSaving(true);
    const token = getToken();
    const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    // 1) 拉取全量产品（全局排序上下文 → 确定每个产品的邻居）
    const allResp = await fetch(`/api/v1/products?page_size=200`, {
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).then(r => r.json()).catch(() => ({ data: { list: [] as Product[] } }));
    const allProducts: Product[] = (allResp.data?.list || []).sort((a: Product, b: Product) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // 2) 构建可见产品 id 集合和新顺序
    const visibleIdSet = new Set(items.map(p => p.id));
    // 原始可见顺序（即 allProducts 中出现顺序，等于拖拽前的 items）
    // 用户拖拽后的新顺序在 items 中

    // 3) 构建新全局顺序：可见产品按拖拽后新序替换，不可见保持原位
    const newGlobalOrder: Product[] = [];
    let vi = 0; // 可见产品迭代索引
    for (const p of allProducts) {
      if (visibleIdSet.has(p.id)) {
        newGlobalOrder.push(items[vi]);
        vi++;
      } else {
        newGlobalOrder.push(p);
      }
    }

    // 4) 只更新可见产品，用邻居 sort_order 中点法计算新值
    const computed = new Map<number, number>(); // id → 新 sort_order（缓存已计算的，供后续邻居引用）
    const updates: Promise<void>[] = [];

    for (let i = 0; i < newGlobalOrder.length; i++) {
      const p = newGlobalOrder[i];
      if (!visibleIdSet.has(p.id)) continue; // 不可见产品不动

      // 左邻居的 sort_order（优先用已计算的新值）
      const leftSo = i > 0 ? (computed.get(newGlobalOrder[i - 1].id) ?? (newGlobalOrder[i - 1].sort_order ?? 0)) : null;
      // 右邻居的 sort_order（用旧值——可能还没处理到）
      const rightSo = i < newGlobalOrder.length - 1 ? (newGlobalOrder[i + 1].sort_order ?? 0) : null;

      let newSo: number;
      if (leftSo === null && rightSo === null) {
        newSo = 0;
      } else if (leftSo === null) {
        newSo = rightSo! - 1;
      } else if (rightSo === null) {
        newSo = leftSo + 1;
      } else {
        newSo = (leftSo + rightSo) / 2;
      }

      computed.set(p.id, newSo);

      // 只在 sort_order 确实变化时才发送 PUT
      const oldSo = allProducts.find(ap => ap.id === p.id)?.sort_order ?? 0;
      if (Math.abs(oldSo - newSo) > 0.0001) {
        updates.push(
          fetch(`/api/v1/admin/products/${p.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ sort_order: newSo }),
          }).then(() => {}).catch(() => {})
        );
      }
    }

    await Promise.all(updates);
    // 用新的 sort_order 更新本地 items 和 original 快照（刷新 sort_order 字段）
    const refreshed = items.map(p => ({ ...p, sort_order: computed.get(p.id) ?? p.sort_order }));
    setItems(refreshed);
    setOriginal(refreshed);
    setDirty(false);
    setSaving(false);
  }

  // 取消排序，恢复到原始顺序
  function handleCancelOrder() {
    setItems([...original]);
    setDirty(false);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Products</h2>
          {saving && <span className="text-xs text-amber-500">Saving...</span>}
          {dirty && !saving && (
            <span className="text-xs text-orange-500 font-medium">Order changed — unsaved</span>
          )}
        </div>
        <Link href="/product-form" className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">+ New Product</Link>
      </div>

      {/* 排序确认栏 */}
      {dirty && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: "#FFF8E1", borderColor: "#FFD54F" }}>
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span className="text-sm text-amber-800 flex-1">You have unsaved order changes. Save or cancel before switching pages.</span>
          <button onClick={handleCancelOrder} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleSaveOrder} className="px-4 py-1.5 text-sm font-medium text-white bg-brand-500 rounded hover:bg-brand-600">Save Order</button>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Search products..." className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 dark:bg-gray-800 dark:border-gray-700" />
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button onClick={() => { setKeyword(""); setCategoryId(""); }} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">✕ Clear filters</button>
      </div>

      {/* 产品表格 */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-2 py-3 w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" /></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No products found</td></tr>
            ) : items.map((p, idx) => (
              <tr
                key={p.id}
                draggable
                onDragStart={e => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, idx)}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${dragIdx === idx ? "opacity-50 bg-blue-50 dark:bg-blue-900/10" : ""}`}
              >
                <td className="px-2 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
                    <circle cx="9" cy="5" r="1.5" fill="currentColor" /><circle cx="15" cy="5" r="1.5" fill="currentColor" />
                    <circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="9" cy="19" r="1.5" fill="currentColor" /><circle cx="15" cy="19" r="1.5" fill="currentColor" />
                  </svg>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.cover_image ? <img src={`${API_BASE}${p.cover_image}`} className="w-10 h-10 rounded object-cover" alt="" /> : <div className="w-10 h-10 rounded bg-gray-100" />}
                    <span className="font-medium text-gray-800 dark:text-white/90">{p.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.category?.name || "-"}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${p.status === "PUBLISHED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{p.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/product-form?id=${p.id}`} className="text-brand-500 hover:text-brand-600 text-sm">Edit</Link>
                    <button onClick={() => handleDelete(p.id, p.title)} className="text-red-500 hover:text-red-600 text-sm">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">Drag rows using the grip handle (⋮⋮) to reorder, then click <strong>Save Order</strong> to persist.</p>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Product"
        message={`Are you sure you want to delete "${confirmTarget?.title}"? This action cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null); }}
      />
    </div>
  );
}
