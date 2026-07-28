/*
 * 页面：产品分类管理页（/categories）
 * 职责：产品分类的 CRUD（增删改查）+ 拖拽排序。从后端 /api/v1/admin/categories 获取分类列表，
 * 支持新建分类、编辑名称/别名/排序、删除（确认弹窗）、拖拽调整顺序（持久化到 /admin/categories/sort）。
 * 分类数据用于产品页的分类筛选下拉。
 *
 * 相关 issue：#5（统一 API 客户端）、#7（分类 CRUD + 拖拽排序）、#16（统一错误提示）、#24（表格横向滚动）。
 */
"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/api-client";
import type { ProductCategory, Paginated } from "@/types";

/** 列表行：后端分类 VO + 本地统计的产品数。 */
interface Cat extends ProductCategory {
  count: number;
}

/** 分类表单状态（后端 CategoryCreate / CategoryUpdate 仅含 name/slug/sort_order）。 */
interface CatForm {
  id?: number;
  name: string;
  slug: string;
  sort_order: string;
}

export default function CategoriesPage() {
  const toast = useToast();
  const [items, setItems] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 新建 / 编辑对话框
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatForm | null>(null); // 有 id 表示编辑
  const [saving, setSaving] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Cat | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 拖拽排序
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // 加载分类列表 + 各分类产品计数
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [catJson, prodJson] = await Promise.all([
        apiFetch<Paginated<ProductCategory>>("/admin/categories?page_size=50"),
        apiFetch<{ list: { category: { id: number } | null }[] }>("/products?page_size=200").catch(
          () => ({ list: [] as { category: { id: number } | null }[] })
        ),
      ]);

      const products = prodJson.list || [];
      const countMap: Record<number, number> = {};
      products.forEach((p) => {
        const cid = p.category?.id;
        if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
      });

      const cats: Cat[] = (catJson.list || []).map((c) => ({
        ...c,
        count: countMap[c.id] || 0,
      }));
      cats.sort((a, b) => a.sort_order - b.sort_order);
      setItems(cats);
    } catch (err) {
      // 401 已由 apiFetch 统一处理（跳登录）；其余错误在此提示。
      setError(err instanceof Error ? err.message : "加载失败");
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 打开新建对话框
  function openCreate() {
    setEditing({ name: "", slug: "", sort_order: String(items.length) });
    setDialogOpen(true);
  }

  // 打开编辑对话框
  function openEdit(c: Cat) {
    setEditing({ id: c.id, name: c.name, slug: c.slug, sort_order: String(c.sort_order) });
    setDialogOpen(true);
  }

  // 根据名称自动生成 slug（新建且未手动填写时）
  function handleNameChange(name: string) {
    setEditing((prev) => {
      if (!prev) return prev;
      const slug = prev.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return { ...prev, name, slug };
    });
  }

  // 提交新建 / 编辑
  async function handleSubmit() {
    if (!editing || !editing.name.trim()) {
      toast.error("请填写分类名称");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        slug: editing.slug.trim() || editing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        sort_order: editing.sort_order === "" ? undefined : Number(editing.sort_order),
      };
      if (editing.id != null) {
        await apiFetch(`/admin/categories/${editing.id}`, { method: "PUT", body: payload });
        toast.success("分类已更新");
      } else {
        await apiFetch("/admin/categories", { method: "POST", body: payload });
        toast.success("分类已创建");
      }
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      // 错误已由 apiFetch 抛出，这里仅提示（避免静默失败，issue #16）
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 确认删除
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/categories/${deleteTarget.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("分类已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // 拖拽开始
  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIdx(index);
    e.dataTransfer.effectAllowed = "move";
  }

  // 拖拽放置 —— 更新本地顺序并持久化到后端
  async function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setItems(reordered);
    setDragIdx(null);
    try {
      await apiFetch("/admin/categories/sort", {
        method: "PUT",
        body: { ids: reordered.map((c) => c.id) },
      });
      toast.success("排序已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "排序保存失败");
      void load(); // 失败回滚到服务端顺序
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Categories</h2>
        <Button size="sm" onClick={openCreate}>+ New Category</Button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
              <tr>
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Slug</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Products</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No categories found
                  </td>
                </tr>
              ) : (
                items.map((c, idx) => (
                  <tr
                    key={c.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      dragIdx === idx ? "bg-blue-50 opacity-50 dark:bg-blue-900/10" : ""
                    }`}
                  >
                    <td className="px-2 py-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cursor-grab text-gray-300 active:cursor-grabbing hover:text-gray-500">
                        <circle cx="9" cy="5" r="1.5" fill="currentColor" /><circle cx="15" cy="5" r="1.5" fill="currentColor" />
                        <circle cx="9" cy="12" r="1.5" fill="currentColor" /><circle cx="15" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="9" cy="19" r="1.5" fill="currentColor" /><circle cx="15" cy="19" r="1.5" fill="currentColor" />
                      </svg>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500">{c.slug}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.count > 0
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {c.count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(c)} className="text-sm text-brand-500 hover:text-brand-600">
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="text-sm text-red-500 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Drag rows using the grip handle (⋮⋮) to reorder. Changes are saved automatically.
      </p>

      {/* 新建 / 编辑对话框 */}
      <Modal isOpen={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }}>
        <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            {editing?.id != null ? "Edit Category" : "New Category"}
          </h3>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={editing?.name || ""}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Cameras"
              />
            </div>
            <div>
              <Label>Slug *</Label>
              <Input
                value={editing?.slug || ""}
                onChange={(e) => setEditing((p) => (p ? { ...p, slug: e.target.value } : p))}
                placeholder="cameras"
              />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={editing?.sort_order || "0"}
                onChange={(e) => setEditing((p) => (p ? { ...p, sort_order: e.target.value } : p))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => { setDialogOpen(false); setEditing(null); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget != null}
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
