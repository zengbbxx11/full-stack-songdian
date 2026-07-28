/*
 * 页面：新闻管理页（/news）
 * 职责：新闻列表 CRUD + 拖拽排序。与 products 页面结构一致，
 * 从后端 /api/v1/admin/news 获取数据，支持拖拽调整排序、关键词筛选、删除（确认弹窗）。
 * 排序通过 HTML5 Drag & Drop 本地维护后逐个 PUT 到后端。
 */
"use client";
import React, { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { NewsItem, Paginated } from "@/types";

export default function NewsPage() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);
  const [search, setSearch] = useState("");
  const [localItems, setLocalItems] = useState<NewsItem[] | null>(null);

  const newsKey = "/news?page_size=50";
  const { data, isLoading } = useSWR<Paginated<NewsItem>>(newsKey, swrFetcher);

  const items = localItems ?? (data?.list ?? []).sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  const [original, setOriginal] = useState<NewsItem[] | null>(null);
  const loading = isLoading && !data;

  // 当 SWR 数据变化时重置本地状态
  React.useEffect(() => {
    if (data?.list) {
      const sorted = [...data.list].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
      setLocalItems(null);
      setOriginal(sorted);
      setDirty(false);
    }
  }, [data]);

  const filtered = search.trim()
    ? items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    : items;

  function handleDelete(id: number, title: string) {
    setDeleteConfirm({ id, title });
  }

  async function handleConfirmDelete() {
    if (!deleteConfirm) return;
    try {
      await apiFetch(`/admin/news/${deleteConfirm.id}`, { method: "DELETE" });
      setLocalItems(prev => (prev ?? items).filter(n => n.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      toast.success("Article deleted");
      mutate(newsKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

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
    setLocalItems(reordered);
    setDragIdx(null);
    setDirty(true);
  }

  // 保存排序
  async function handleSaveOrder() {
    setSaving(true);
    try {
      await Promise.all(items.map((n, i) =>
        apiFetch(`/admin/news/${n.id}`, {
          method: "PUT",
          body: { sort_order: i },
        }).catch((err) => {
          toast.error(`Failed to save order for "${n.title}": ${err instanceof Error ? err.message : "Unknown error"}`);
        })
      ));
      setOriginal([...items]);
      setDirty(false);
      mutate(newsKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSaving(false);
    }
  }

  // 取消排序，恢复到原始顺序
  function handleCancelOrder() {
    setLocalItems(original ? [...original] : null);
    setDirty(false);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">News</h2>
          {saving && <span className="text-xs text-amber-500">Saving...</span>}
          {dirty && !saving && (
            <span className="text-xs text-orange-500 font-medium">Order changed — unsaved</span>
          )}
        </div>
        <Link href="/news-form" className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">+ New Article</Link>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500 lg:w-80"
        />
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
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-2 py-3 w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-2 py-3"><div className="w-4 h-4 rounded animate-pulse bg-gray-100 dark:bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-4 rounded animate-pulse bg-gray-100 dark:bg-gray-800" style={{ width: `${60 + Math.random() * 30}%`, animationDelay: `${i * 0.1}s` }} /></td>
                  <td className="px-4 py-3"><div className="h-5 w-16 rounded animate-pulse bg-gray-100 dark:bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded animate-pulse bg-gray-100 dark:bg-gray-800" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded animate-pulse bg-gray-100 dark:bg-gray-800" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{search ? "No matching articles" : "No articles found"}</td></tr>
            ) : filtered.map((n, idx) => (
              <tr
                key={n.id}
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
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{n.title}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${n.status === "PUBLISHED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{n.status}</span></td>
                <td className="px-4 py-3 text-gray-500">{n.published_at || n.created_time || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/news-form?id=${n.id}`} className="text-brand-500 hover:text-brand-600 text-sm">Edit</Link>
                    <button onClick={() => handleDelete(n.id, n.title)} className="text-red-500 hover:text-red-600 text-sm">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">Drag rows using the grip handle to reorder, then click <strong>Save Order</strong> to persist.</p>
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete Article"
        message={deleteConfirm ? `Delete "${deleteConfirm.title}"?` : ""}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
