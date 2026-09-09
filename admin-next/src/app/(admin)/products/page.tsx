/*
 * 页面：产品管理页（/products）
 * 职责：产品列表 CRUD + 拖拽排序 + 批量操作 + SEO 快速编辑。
 */
"use client";
// 后台缩略图来自运行时上传地址，使用原生 img 避免远程源配置阻断管理操作。
/* eslint-disable @next/next/no-img-element */
import React, { useState, useMemo } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { apiFetch, apiFetchAllPages, swrFetcher, resolveMediaUrl } from "@/lib/api-client";
import { settleBatch } from "@/lib/batch";
import { mergeVisibleOrder } from "@/lib/content-order";
import type { Product, ProductCategory, Paginated } from "@/types";

export default function ProductsPage() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: number; title: string } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [localItems, setLocalItems] = useState<Product[] | null>(null);
  // 批量操作
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<{ open: boolean; action: string; title: string; message: string }>({ open: false, action: "", title: "", message: "" });
  // SEO 快速编辑弹窗
  const [seoEdit, setSeoEdit] = useState<{ open: boolean; target: Product | null; seoTitle: string; seoDesc: string }>({ open: false, target: null, seoTitle: "", seoDesc: "" });
  const [seoSaving, setSeoSaving] = useState(false);

  const productsKey = useMemo(() => {
    const params = new URLSearchParams({ page_size: "50" });
    if (keyword) params.set("keyword", keyword);
    if (categoryId) params.set("category_id", categoryId);
    return `/admin/products?${params}`;
  }, [keyword, categoryId]);

  const { data: productsData, isLoading: productsLoading, error: productsError } = useSWR<Paginated<Product>>(productsKey, (path: string) => apiFetchAllPages<Product>(path));
  const { data: catsData } = useSWR<Paginated<ProductCategory>>("/admin/categories?page_size=50", swrFetcher);
  const categories = catsData?.list ?? [];

  const items = localItems ?? [...(productsData?.list ?? [])].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  const loading = productsLoading && !productsData;
  const busy = saving || batchSaving;

  function resetListDraft() {
    setLocalItems(null);
    setSelectedIds(new Set());
    setDirty(false);
  }

  /* ── 选择逻辑 ── */
  const allSelected = items.length > 0 && items.every(item => selectedIds.has(item.id));
  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(p => p.id)));
  }
  function toggleSelectOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  /* ── 单条删除 ── */
  async function handleDelete(id: number, title: string) {
    setConfirmTarget({ id, title });
    setConfirmOpen(true);
  }
  async function confirmDelete() {
    if (!confirmTarget) return;
    try {
      await apiFetch(`/admin/products/${confirmTarget.id}`, { method: "DELETE" });
      setSelectedIds(previous => new Set([...previous].filter(id => id !== confirmTarget.id)));
      await mutate(productsKey);
      toast.success("产品已删除");
    } catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); }
    setConfirmOpen(false); setConfirmTarget(null);
  }

  /* ── 批量操作 ── */
  function openBatchConfirm(action: string, title: string, message: string) {
    setBatchConfirm({ open: true, action, title, message });
  }
  async function executeBatch() {
    if (selectedIds.size === 0 || batchSaving) return;
    setBatchSaving(true);
    setBatchConfirm(p => ({ ...p, open: false }));
    const idList = Array.from(selectedIds);
    const total = idList.length;
    try {
      const results = await settleBatch(idList, async (id) => {
        if (batchConfirm.action === "publish") {
          await apiFetch(`/admin/products/${id}`, { method: "PUT", body: { status: "PUBLISHED" } });
        } else if (batchConfirm.action === "hide") {
          await apiFetch(`/admin/products/${id}`, { method: "PUT", body: { status: "DRAFT" } });
        } else if (batchConfirm.action === "delete") {
          await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
        }
      });
      const failedIds = idList.filter((_, index) => results[index].status === "rejected");
      setSelectedIds(new Set(failedIds));
      setLocalItems(null);
      await mutate(productsKey);
      const label = batchConfirm.action === "delete" ? "已删除" : batchConfirm.action === "publish" ? "已发布" : "已隐藏";
      if (failedIds.length) {
        toast.error(`${label} ${total - failedIds.length}/${total} 个产品；失败 ${failedIds.length} 个，已保留选中项，可重试`);
      } else {
        toast.success(`${label} ${total} 个产品`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量操作失败，请刷新列表确认结果");
    } finally {
      setBatchSaving(false);
    }
  }

  /* ── 拖拽排序 ── */
  function handleDragStart(e: React.DragEvent, index: number) { setDragIdx(index); e.dataTransfer.effectAllowed = "move"; }
  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setLocalItems(reordered); setDragIdx(null); setDirty(true);
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }

  async function handleSaveOrder() {
    setSaving(true);
    try {
      const allResp = await apiFetchAllPages<Product>("/admin/products");
      const allProducts: Product[] = (allResp.list ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const newGlobalOrder = mergeVisibleOrder(allProducts, items);
      const currentRanks = new Map(allProducts.map(product => [product.id, product.sort_order]));
      const updates = newGlobalOrder.map((product, rank) => ({ id: product.id, rank }))
        .filter(({ id, rank }) => currentRanks.get(id) !== rank);
      const results = await settleBatch(updates, ({ id, rank }) =>
        apiFetch(`/admin/products/${id}`, { method: "PUT", body: { sort_order: rank } }),
      );
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length) {
        toast.error(`排序保存失败 ${failures.length}/${updates.length} 条，未保存顺序已保留，请重试`);
        return;
      }
      setLocalItems(null); setDirty(false);
      await mutate(productsKey);
      toast.success("排序已保存");
    } catch (err) { toast.error(err instanceof Error ? err.message : "排序保存失败"); }
    finally { setSaving(false); }
  }
  function handleCancelOrder() { setLocalItems(null); setDirty(false); void mutate(productsKey); }

  /* ── SEO ── */
  async function handleSeoSave() {
    if (!seoEdit.target) return;
    setSeoSaving(true);
    try {
      await apiFetch(`/admin/products/${seoEdit.target.id}`, { method: "PUT", body: { seo_title: seoEdit.seoTitle || null, seo_description: seoEdit.seoDesc || null } });
      toast.success("SEO 已更新");
      setSeoEdit({ open: false, target: null, seoTitle: "", seoDesc: "" }); mutate(productsKey);
    } catch (err) { toast.error(err instanceof Error ? err.message : "SEO 保存失败"); }
    finally { setSeoSaving(false); }
  }

  /* ── 渲染 ── */
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">产品</h2>
          {saving && <span className="text-xs text-amber-500">保存中...</span>}
          {dirty && !saving && <span className="text-xs text-orange-500 font-medium">顺序已调整 — 未保存</span>}
        </div>
        <Link href="/product-form" className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">+ 新建产品</Link>
      </div>

      {/* 排序确认栏 */}
      {dirty && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: "#FFF8E1", borderColor: "#FFD54F" }}>
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span className="text-sm text-amber-800 flex-1">您有未保存的排序更改，切换页面前请先保存或取消。</span>
          <button disabled={busy} onClick={handleCancelOrder} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">取消</button>
          <button disabled={busy} onClick={handleSaveOrder} className="px-4 py-1.5 text-sm font-medium text-white bg-brand-500 rounded hover:bg-brand-600">保存排序</button>
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg border border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">已选 {selectedIds.size} 个</span>
          <button onClick={() => openBatchConfirm("publish", "批量发布", `确定将 ${selectedIds.size} 个产品标记为「已发布」吗？`)} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700" disabled={busy || dirty}>发布选中</button>
          <button onClick={() => openBatchConfirm("hide", "批量隐藏", `确定将 ${selectedIds.size} 个产品标记为「草稿」吗？`)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" disabled={busy || dirty}>隐藏选中</button>
          <button onClick={() => openBatchConfirm("delete", "批量删除", `确定要永久删除 ${selectedIds.size} 个产品吗？此操作不可撤销。`)} className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700" disabled={busy || dirty}>删除选中</button>
          <button disabled={busy} onClick={() => setSelectedIds(new Set())} className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">取消选择</button>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="text" value={keyword} disabled={busy || dirty} onChange={e => { resetListDraft(); setKeyword(e.target.value); }} placeholder="搜索产品..." className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 dark:bg-gray-800 dark:border-gray-700" />
        <select value={categoryId} disabled={busy || dirty} onChange={e => { resetListDraft(); setCategoryId(e.target.value); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
          <option value="">全部分类</option>
          {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <button disabled={busy || dirty} onClick={() => { resetListDraft(); setKeyword(""); setCategoryId(""); }} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">✕ 清除筛选</button>
      </div>

      {/* 产品表格 */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-2 py-3 w-8"><input type="checkbox" aria-label="全选产品" disabled={busy || dirty} checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer" /></th>
              <th className="px-2 py-3 w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">分类</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SEO</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" /></td></tr>
            ) : productsError && !productsData ? (
              <tr><td colSpan={7} role="alert" className="px-4 py-8 text-center text-red-600">产品加载失败 <button onClick={() => mutate(productsKey)} className="underline">重试</button></td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">未找到产品</td></tr>
            ) : items.map((p, idx) => (
              <tr key={p.id} draggable={!busy} onDragStart={e => handleDragStart(e, idx)} onDragEnd={() => setDragIdx(null)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, idx)}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedIds.has(p.id) ? "bg-brand-50 dark:bg-brand-900/10" : ""} ${dragIdx === idx ? "opacity-50" : ""}`}>
                <td className="px-2 py-3"><input type="checkbox" aria-label={`选择 ${p.title}`} disabled={busy || dirty} checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 cursor-pointer" /></td>
                <td className="px-2 py-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
                    <circle cx="9" cy="5" r="1.5" fill="currentColor" /><circle cx="15" cy="5" r="1.5" fill="currentColor" />
                    <circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="9" cy="19" r="1.5" fill="currentColor" /><circle cx="15" cy="19" r="1.5" fill="currentColor" />
                  </svg>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {p.cover_image ? <img src={resolveMediaUrl(p.cover_image)} className="w-10 h-10 rounded object-cover" alt="" /> : <div className="w-10 h-10 rounded bg-gray-100" />}
                    <span className="font-medium text-gray-800 dark:text-white/90">{p.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{p.category?.name || "-"}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${p.status === "PUBLISHED" ? "bg-blue-100 text-blue-700" : p.status === "SCHEDULED" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{p.status === "PUBLISHED" ? "已发布" : p.status === "SCHEDULED" ? "定时发布" : p.status === "DRAFT" ? "草稿" : p.status}</span></td>
                <td className="px-4 py-3">
                  <button disabled={busy || dirty} onClick={() => setSeoEdit({ open: true, target: p, seoTitle: p.seo_title || "", seoDesc: p.seo_description || "" })}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${p.seo_title ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : "bg-gray-50 text-gray-400 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-500"}`}>
                    {p.seo_title ? "已设置" : "未设置"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/product-form?id=${p.id}`} className="text-brand-500 hover:text-brand-600 text-sm">编辑</Link>
                    <Link href={`/product-form?copy_from=${p.id}`} className="text-blue-500 hover:text-blue-600 text-sm">复制</Link>
                    <button disabled={busy || dirty} onClick={() => handleDelete(p.id, p.title)} className="text-red-500 hover:text-red-600 text-sm">删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">拖动行首握把可调整顺序 → 保存排序。勾选行可批量发布/隐藏/删除。</p>

      {/* SEO 快速编辑弹窗 */}
      {seoEdit.open && seoEdit.target && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSeoEdit({ open: false, target: null, seoTitle: "", seoDesc: "" })} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">SEO 设置 — {seoEdit.target.title}</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO 标题 <span className="text-xs text-gray-400">（推荐 60 字以内）</span></label>
                <div className="relative">
                  <input value={seoEdit.seoTitle} onChange={e => setSeoEdit(p => ({ ...p, seoTitle: e.target.value }))} placeholder="留空则自动使用产品标题" maxLength={120} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${seoEdit.seoTitle.length > 60 ? "text-amber-500" : "text-gray-400"}`}>{seoEdit.seoTitle.length}/120</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">SEO 描述 <span className="text-xs text-gray-400">（推荐 120-160 字）</span></label>
                <div className="relative">
                  <textarea value={seoEdit.seoDesc} onChange={e => setSeoEdit(p => ({ ...p, seoDesc: e.target.value }))} rows={4} maxLength={300} placeholder="留空则自动使用产品简介截取前 160 字符" className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                  <span className={`absolute right-2 bottom-2 text-xs ${seoEdit.seoDesc.length > 160 ? "text-amber-500" : "text-gray-400"}`}>{seoEdit.seoDesc.length}/300</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setSeoEdit({ open: false, target: null, seoTitle: "", seoDesc: "" })} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700" disabled={seoSaving}>取消</button>
              <button onClick={handleSeoSave} className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50" disabled={seoSaving}>{seoSaving ? "保存中..." : "保存 SEO"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 单条删除确认 */}
      <ConfirmDialog open={confirmOpen} title="删除产品" message={`确定要删除「${confirmTarget?.title}」吗？此操作不可撤销。`} onConfirm={confirmDelete} onCancel={() => { setConfirmOpen(false); setConfirmTarget(null); }} />

      {/* 批量操作确认 */}
      <ConfirmDialog open={batchConfirm.open} title={batchConfirm.title} message={batchConfirm.message} confirmText={batchConfirm.action === "delete" ? "删除" : "确定"} loading={batchSaving} onConfirm={executeBatch} onCancel={() => setBatchConfirm(p => ({ ...p, open: false }))} />
    </div>
  );
}
