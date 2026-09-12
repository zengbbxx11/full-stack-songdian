/*
 * 页面：媒体管理页 v3（/media）—— Loop 2：树形相册 + 引用追踪
 *
 * 职责：
 * - 左侧树形相册侧边栏：All / 未分类 / 层级相册（展开/折叠），支持新建子目录/改名/删除
 * - 顶部工具栏：搜索框 + 上传按钮 + 全选
 * - 图片网格：缩略图 + 标题 + Copy URL + "Used in" 引用标签 + 删除
 * - 删除保护：查引用明细（含产品/新闻名称），弹窗告警后仍可强制删除
 */
"use client";
// 媒体库必须展示运行时上传的任意尺寸素材，原生 img 在此比优化代理更合适。
/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher, resolveMediaUrl } from "@/lib/api-client";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SelectField from "@/components/form/SelectField";
import { Modal } from "@/components/ui/modal";
import { FolderIcon, PlusIcon, TrashBinIcon } from "@/icons";

// ─────────────────────── 类型 ───────────────────────
interface UploadRecord {
  id: number; url: string; file_name: string; size: number;
  uploaded_by: string | null; album_id: number | null; title: string | null; created_time: string | null;
}
interface Album {
  id: number; name: string; slug: string; sort_order: number;
  // count：直系素材数；total_count：含全部子相册的合计（侧边栏展示用）。
  count: number; total_count?: number;
  parent_id: number | null; created_time: string | null;
}
interface TreeAlbum extends Album { children: TreeAlbum[]; depth: number }
interface UsageItem { type: "product_gallery" | "product_cover" | "news_cover"; name: string; id: number }
interface UsageInfo { count: number; items: UsageItem[]; in_use: boolean }
interface AlbumListData { list: Album[]; total: number; uncategorized: number }
interface PaginatedRecords { list: UploadRecord[]; total: number; page: number; page_size: number }

// ─────────────────────── 工具 ───────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTree(albums: Album[]): TreeAlbum[] {
  const byParent = new Map<number | null, Album[]>();
  for (const a of albums) {
    const pid = a.parent_id;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(a);
  }
  function walk(parentId: number | null, depth: number): TreeAlbum[] {
    return (byParent.get(parentId) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((a) => ({
      ...a, depth, children: walk(a.id, depth + 1),
    }));
  }
  return walk(null, 0);
}

// 引用类型 → 中文标签（列表与弹窗共用，避免两处映射漂移）
const USAGE_TYPE_LABEL: Record<UsageItem["type"], string> = {
  product_gallery: "产品图库",
  product_cover: "产品封面",
  news_cover: "新闻封面",
};

function usageLabel(item: UsageItem): string {
  return `${USAGE_TYPE_LABEL[item.type] ?? item.type}: ${item.name}`;
}

function usageEditHref(item: UsageItem): string {
  return item.type === "news_cover" ? `/news-form?id=${item.id}` : `/product-form?id=${item.id}`;
}

// ─────────────────────── 树节点组件 ───────────────────────
function AlbumNode({
  album, selectedAlbumId, onSelect, onEdit, onDelete,
}: {
  album: TreeAlbum; selectedAlbumId: number | null; onSelect: (id: number) => void;
  onEdit: (a: Album) => void; onDelete: (a: Album) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSelected = selectedAlbumId === album.id;
  const hasChildren = album.children.length > 0;
  const padLeft = 12 + album.depth * 16;

  return (
    <>
      <li className="group relative">
        <button
          onClick={() => onSelect(album.id)}
          className={`w-full text-left rounded-lg text-sm flex items-center justify-between gap-1 transition-colors py-1.5 ${
            isSelected
              ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
          style={{ paddingLeft: `${padLeft}px`, paddingRight: "4px" }}
        >
          <span className="truncate flex items-center gap-1 min-w-0">
            {hasChildren ? (
              <span
                role="button" tabIndex={0}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setOpen(!open); } }}
              >
                <svg width={10} height={10} viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-90" : ""} text-gray-400`}>
                  <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <FolderIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{album.name}</span>
          </span>
          <span className="text-[10px] tabular-nums shrink-0 mr-1" title={`含子相册共 ${album.total_count ?? album.count} 个素材（直系 ${album.count} 个）`}>
            {album.total_count ?? album.count}
          </span>
        </button>
        {/* Hover 操作 */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white dark:bg-gray-900 rounded px-1 mr-4">
          <button onClick={(e) => { e.stopPropagation(); onEdit(album); }} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-gray-400"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(album); }} className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
            <TrashBinIcon className="w-2.5 h-2.5 text-red-400" />
          </button>
        </div>
      </li>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {album.children.map((child) => (
            <AlbumNode key={child.id} album={child} selectedAlbumId={selectedAlbumId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </>
  );
}

// ─────────────────────── 主组件 ───────────────────────
export default function MediaPage() {
  const toast = useToast(); const { mutate } = useSWRConfig();
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState(""); const [page, setPage] = useState(1); const pageSize = 20;
  const [uploading, setUploading] = useState(false); const [uploadAlbumId, setUploadAlbumId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ title: string; message: React.ReactNode; onConfirm: () => void; confirmText?: string } | null>(null);
  const [albumModal, setAlbumModal] = useState<{ open: boolean; editing: Album | null }>({ open: false, editing: null });
  const [albumForm, setAlbumForm] = useState({ name: "", slug: "", parent_id: "" });
  const [usageModal, setUsageModal] = useState<{
    record: UploadRecord | null; info: UsageInfo | null; loading: boolean; error: string | null;
  }>({ record: null, info: null, loading: false, error: null });
  // 引用缓存：按 record id 存储 usage 信息，hover 时懒加载
  const [usageCache, setUsageCache] = useState<Map<number, UsageInfo>>(new Map());

  // ---- 数据 ----
  const albumsKey = "/admin/albums";
  const { data: albumData } = useSWR<AlbumListData>(albumsKey, swrFetcher);
  const albums = albumData?.list ?? [];
  const uncategorized = albumData?.uncategorized ?? 0;
  const tree = buildTree(albums);

  const recordsParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (selectedAlbumId !== null) recordsParams.set("album_id", String(selectedAlbumId));
  if (keyword.trim()) recordsParams.set("keyword", keyword.trim());
  const recordsKey = `/admin/upload/records?${recordsParams.toString()}`;
  const { data: recordsData, isLoading } = useSWR<PaginatedRecords>(recordsKey, swrFetcher);
  const records = recordsData?.list ?? []; const total = recordsData?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectAlbum = (albumId: number | null) => {
    setSelectedAlbumId(albumId);
    setPage(1);
    setSelectedIds(new Set());
  };

  const changeKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  // 多选
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(records.map((r) => r.id)));
  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const clearSelection = () => setSelectedIds(new Set());

  // 上传
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return; setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append("file", file);
      if (uploadAlbumId !== null) fd.append("album_id", String(uploadAlbumId));
      try { await apiFetch("/admin/upload", { method: "POST", body: fd }); } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    }
    setUploading(false); e.target.value = "";
    await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
  }, [uploadAlbumId, albumsKey, recordsKey, mutate, toast]);

  // 删除
  const handleDelete = async (rec: UploadRecord, force = false) => {
    try { await apiFetch(`/admin/upload/${rec.id}?force=${force}`, { method: "DELETE" }); toast.success("已删除"); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); clearSelection(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); }
  };
  const handleDeleteClick = async (rec: UploadRecord) => {
    try {
      const usage = await apiFetch<UsageInfo>(`/admin/upload/${rec.id}/usage`);
      if (usage.in_use) {
        setConfirm({
          title: "删除提醒",
          message: (
            <div>
              <p className="mb-2">该素材仍被 {usage.count} 处内容引用，强制删除可能导致内容展示异常：</p>
              <ul className="list-disc pl-4 text-xs space-y-0.5 text-gray-500 dark:text-gray-400 max-h-32 overflow-y-auto">
                {usage.items.map((item, i) => <li key={i}>{usageLabel(item)}</li>)}
              </ul>
              <p className="mt-2 text-sm font-medium">是否仍要删除？</p>
            </div>
          ),
          confirmText: "仍要删除", onConfirm: () => { handleDelete(rec, true); setConfirm(null); },
        });
      } else {
        setConfirm({ title: "确认删除", message: `确定删除 "${rec.title || rec.file_name}" 吗？此操作不可撤销。`, onConfirm: () => { handleDelete(rec, false); setConfirm(null); } });
      }
    } catch {
      setConfirm({ title: "确认删除", message: `确定删除 "${rec.title || rec.file_name}" 吗？`, onConfirm: () => { handleDelete(rec, false); setConfirm(null); } });
    }
  };
  // 批量删除执行体：仅对确认过的"被引用"素材使用 force，未引用项走普通删除（后端仍会拦截误删）
  const runBatchDelete = async (ids: number[], forceIds: Set<number>) => {
    let failed = 0;
    for (const id of ids) {
      try { await apiFetch(`/admin/upload/${id}?force=${forceIds.has(id)}`, { method: "DELETE" }); }
      catch { failed++; }
    }
    if (failed > 0) toast.error(`批量删除完成：成功 ${ids.length - failed}/${ids.length}，${failed} 项失败`);
    else toast.success(`已删除 ${ids.length} 项`);
    await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
    clearSelection();
  };
  // 批量删除入口：先逐项查询引用，把"仍被引用"的素材明确列出，避免像过去那样静默强制删除
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    // 引用查询复用缓存；单项失败时保守按"未引用"处理，交由后端删除接口兜底
    const inUse: { id: number; usage: UsageInfo }[] = [];
    await Promise.all(ids.map(async (id) => {
      try {
        const cached = usageCache.get(id);
        const usage = cached ?? await apiFetch<UsageInfo>(`/admin/upload/${id}/usage`);
        if (!cached) setUsageCache((prev) => new Map(prev).set(id, usage));
        if (usage.in_use) inUse.push({ id, usage });
      } catch { /* 忽略：按未引用处理 */ }
    }));
    const forceIds = new Set(inUse.map((x) => x.id));
    const safeCount = ids.length - forceIds.size;
    setConfirm({
      title: forceIds.size > 0 ? "批量删除提醒" : "批量删除",
      message: forceIds.size > 0 ? (
        <div>
          <p className="mb-2">选中的 {ids.length} 个素材中有 <strong>{forceIds.size}</strong> 个仍被内容引用，强制删除可能导致内容展示异常：</p>
          <ul className="list-disc pl-4 text-xs space-y-0.5 text-gray-500 dark:text-gray-400 max-h-40 overflow-y-auto">
            {inUse.map(({ id, usage }) => {
              const rec = records.find((r) => r.id === id);
              return <li key={id}>{rec?.title || rec?.file_name || `#${id}`} —— {usage.items.map(usageLabel).join("、")}</li>;
            })}
          </ul>
          <p className="mt-2 text-sm font-medium">{safeCount > 0 ? `其余 ${safeCount} 个未被引用将直接删除。` : ""}是否仍要删除全部？</p>
        </div>
      ) : (
        <p>确定删除选中的 {ids.length} 个文件吗？此操作不可撤销。</p>
      ),
      confirmText: forceIds.size > 0 ? "仍要删除全部" : `删除 ${ids.length} 项`,
      onConfirm: () => { void runBatchDelete(ids, forceIds); setConfirm(null); },
    });
  };
  const copyUrl = (url: string) => { navigator.clipboard.writeText(url); toast.success("Copied!"); };

  // 懒加载引用信息（hover 触发，已缓存则直接返回）
  const fetchUsage = async (recId: number) => {
    if (usageCache.has(recId)) return;
    try {
      const info = await apiFetch<UsageInfo>(`/admin/upload/${recId}/usage`);
      setUsageCache((prev) => new Map(prev).set(recId, info));
    } catch { /* 忽略 */ }
  };

  const openUsage = async (rec: UploadRecord) => {
    const cached = usageCache.get(rec.id) ?? null;
    setUsageModal({ record: rec, info: cached, loading: !cached, error: null });
    if (cached) return;
    try {
      const info = await apiFetch<UsageInfo>(`/admin/upload/${rec.id}/usage`);
      setUsageCache((prev) => new Map(prev).set(rec.id, info));
      setUsageModal((prev) => prev.record?.id === rec.id ? { ...prev, info, loading: false } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : "引用信息加载失败";
      setUsageModal((prev) => prev.record?.id === rec.id ? { ...prev, loading: false, error: message } : prev);
    }
  };

  // 相册 CRUD
  const openCreateAlbum = () => { setAlbumForm({ name: "", slug: "", parent_id: "" }); setAlbumModal({ open: true, editing: null }); };
  const openEditAlbum = (a: Album) => { setAlbumForm({ name: a.name, slug: a.slug, parent_id: a.parent_id?.toString() ?? "" }); setAlbumModal({ open: true, editing: a }); };
  const saveAlbum = async () => {
    if (!albumForm.name.trim()) { toast.error("请输入名称"); return; }
    const body: Record<string, unknown> = { name: albumForm.name.trim(), slug: albumForm.slug.trim() || undefined };
    const pid = albumForm.parent_id ? Number(albumForm.parent_id) : null;
    if (albumModal.editing) { body.parent_id = pid === albumModal.editing.id ? undefined : pid; } else { body.parent_id = pid || undefined; }
    try {
      if (albumModal.editing) { await apiFetch(`/admin/albums/${albumModal.editing.id}`, { method: "PUT", body }); toast.success("相册已更新"); }
      else { await apiFetch("/admin/albums", { method: "POST", body }); toast.success("相册已创建"); }
      setAlbumModal({ open: false, editing: null }); await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存失败"); }
  };
  const deleteAlbum = async (a: Album) => {
    // total_count 含子相册素材（后端已按子树合计）；删除父相册会级联删除整棵子树，
    // 因此这里展示的是"本次操作影响到的素材总数"，避免只报直系数造成低估。
    const affected = a.total_count ?? a.count;
    setConfirm({ title: "删除相册", message: `确定删除「${a.name}」吗？其中的 ${affected} 个素材将变为"未分类"，所有子相册也将被级联删除。`, confirmText: "删除相册",
      onConfirm: async () => { try { await apiFetch(`/admin/albums/${a.id}`, { method: "DELETE" }); toast.success("已删除"); if (selectedAlbumId === a.id) setSelectedAlbumId(null); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); } catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); } setConfirm(null); } });
  };

  // ─────────────────────── 渲染 ───────────────────────
  return (
    <div className="flex gap-6 items-start">
      {/* 左侧树形相册 */}
      <aside className="w-56 shrink-0 bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">相册</h3>
          <button onClick={openCreateAlbum} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="新建相册"><PlusIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <ul className="space-y-0.5">
          <li><button onClick={() => selectAlbum(null)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === null ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className="flex items-center gap-2"><FolderIcon className="w-4 h-4" />全部</span><span className="text-xs tabular-nums">{albumData ? albumData.list.filter((a) => a.parent_id === null).reduce((s, a) => s + (a.total_count ?? a.count), 0) + uncategorized : 0}</span></button></li>
          {uncategorized > 0 && (
            <li><button onClick={() => selectAlbum(0)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className="flex items-center gap-2"><FolderIcon className="w-4 h-4 opacity-50" />未分类</span><span className="text-xs tabular-nums">{uncategorized}</span></button></li>
          )}
          {tree.map((node) => <AlbumNode key={node.id} album={node} selectedAlbumId={selectedAlbumId} onSelect={selectAlbum} onEdit={openEditAlbum} onDelete={deleteAlbum} />)}
        </ul>
      </aside>

      {/* 主内容 */}
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">媒体库</h2>
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300">
          产品表单上传的图片会自动归入 <strong>Products / 产品别名</strong>，新闻封面会归入 <strong>News / 新闻别名</strong>；上传前未填写别名的图片会进入“未分类”。相册只用于整理，不会改变图片 URL。
        </div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx={11} cy={11} r={8}/><path d="m21 21-4.3-4.3" strokeLinecap="round"/></svg>
            <input type="text" placeholder="搜索..." value={keyword} onChange={(e) => changeKeyword(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <SelectField
            selectSize="sm"
            className="max-w-[140px]"
            aria-label="上传到相册"
            value={uploadAlbumId ?? ""}
            onChange={(e) => setUploadAlbumId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">无相册</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${uploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600"}`}>
            {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 上传中...</> : <><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg> 上传</>}
            <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          {/* 同步按钮：补齐 product/news 引用图片的记录 */}
          <button
            onClick={async () => {
              try {
                const r = await apiFetch<{ found: number; synced: number }>("/admin/upload/sync", { method: "POST" });
                toast.success(`Synced ${r.synced}/${r.found} images`);
                await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
              } catch (err) { toast.error(err instanceof Error ? err.message : "同步失败"); }
            }}
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Scan products & news for image references not yet tracked"
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="inline mr-1"><path d="M21 12a9 9 0 11-6.219-8.56"/><path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            同步引用图片
          </button>
          {/* 自动归���按钮 */}
          <button
            onClick={async () => {
              try {
                const r = await apiFetch<{ categorized: number; albums_created: number }>("/admin/upload/auto-categorize", { method: "POST" });
                toast.success(`Categorized ${r.categorized} images into ${r.albums_created} albums`);
                await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
              } catch (err) { toast.error(err instanceof Error ? err.message : "归类失败"); }
            }}
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Auto-categorize uncategorized images by product/news path"
          >
            <FolderIcon className="w-3 h-3 inline mr-1" />
            自动归类
          </button>
          {selectedIds.size > 0 && (<><span className="text-xs text-gray-500 ml-2">已选择 {selectedIds.size} 项</span><button onClick={() => void handleBatchDelete()} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"><TrashBinIcon className="w-3.5 h-3.5 inline mr-1" /> 批量删除</button></>)}
        </div>

        {total === 0 && !isLoading && (
          <label className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors mb-4">
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-gray-300 dark:text-gray-600"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">拖拽图片到此处，或点击上传</p><p className="text-xs text-gray-400">JPG / PNG / WebP / GIF · 最大 10MB</p>
            <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}

        {isLoading ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : records.length > 0 ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-3 mb-3 px-1"><label className="flex items-center gap-1.5 cursor-pointer select-none"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /><span className="text-xs text-gray-500">{allSelected ? "取消全选" : "全选"}</span></label><span className="text-xs text-gray-400 ml-auto">共 {total} 个文件</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {records.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                return (
                  <div key={rec.id} className={`group relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${isSelected ? "border-brand-500 bg-brand-50/30 dark:bg-brand-900/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`} onClick={() => toggleSelect(rec.id)} onMouseEnter={() => fetchUsage(rec.id)}>
                    <div className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}><input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded border-white bg-white/80 text-brand-500 focus:ring-brand-500 shadow-sm" /></div>
                    <div className="aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800"><img src={resolveMediaUrl(rec.url)} alt={rec.title || rec.file_name} className="w-full h-full object-cover" loading="lazy" /></div>
                    <div className="p-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5">{rec.title || rec.file_name}</p>
                      <p className="text-[10px] text-gray-400 mb-1.5">{formatSize(rec.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void openUsage(rec); }}
                        className={`mb-1.5 flex w-full items-center justify-between rounded px-1.5 py-1 text-[10px] transition-colors ${
                          usageCache.get(rec.id)?.in_use
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                            : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {usageCache.has(rec.id) ? (usageCache.get(rec.id)!.in_use ? (
                            <>
                            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              使用中 · {usageCache.get(rec.id)!.count} 处
                            </>
                          ) : "未使用") : "查看使用情况"}
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); copyUrl(resolveMediaUrl(rec.url)); }} className="flex-1 text-[11px] py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">复制</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(rec); }} className="text-[11px] py-1 px-2 rounded bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"><TrashBinIcon className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5"><button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">上一页</button><span className="text-sm text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span><button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">下一页</button></div>
            )}
          </div>
        ) : recordsData ? (<div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center"><p className="text-gray-400 dark:text-gray-600 text-sm">{keyword ? "没有匹配搜索条件的文件。" : "该相册暂无文件。"}</p></div>) : null}
      </div>

      {/* 对话框 */}
      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ""} message={confirm?.message ?? ""} onConfirm={confirm?.onConfirm ?? (() => {})} onCancel={() => setConfirm(null)} confirmText={confirm?.confirmText ?? "删除"} />

      <Modal
        isOpen={!!usageModal.record}
        onClose={() => setUsageModal({ record: null, info: null, loading: false, error: null })}
        className="mx-4 max-w-2xl"
      >
        {usageModal.record && (
          <div className="p-6 sm:p-8">
            <h3 className="pr-12 text-lg font-semibold text-gray-800 dark:text-white/90">图片使用情况</h3>
            <div className="mt-5 flex gap-4 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <img src={resolveMediaUrl(usageModal.record.url)} alt={usageModal.record.title || usageModal.record.file_name} className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-gray-700" />
              <div className="min-w-0 self-center">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{usageModal.record.title || usageModal.record.file_name}</p>
                <p className="mt-1 break-all text-xs leading-5 text-gray-500 dark:text-gray-400">{usageModal.record.url}</p>
              </div>
            </div>

            <div className="mt-5">
              {usageModal.loading && <p className="py-8 text-center text-sm text-gray-400">正在查询引用位置...</p>}
              {usageModal.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{usageModal.error}</p>}
              {!usageModal.loading && !usageModal.error && usageModal.info && !usageModal.info.in_use && (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">这张图片目前未被使用</p>
                  <p className="mt-1 text-xs text-gray-400">可以安全整理或删除，但删除操作仍不可撤销。</p>
                </div>
              )}
              {!usageModal.loading && usageModal.info?.in_use && (
                <div>
                  <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">共被 {usageModal.info.count} 处内容引用：</p>
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {usageModal.info.items.map((item, index) => (
                      <li key={`${item.type}-${item.id}-${index}`} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">{USAGE_TYPE_LABEL[item.type]}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                        <Link href={usageEditHref(item)} className="shrink-0 text-xs font-medium text-brand-500 hover:text-brand-600">查看内容</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={albumModal.open} onClose={() => setAlbumModal({ open: false, editing: null })}>
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">{albumModal.editing ? "编辑相册" : "新建相册"}</h3>
          <div className="space-y-3">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称</label><input type="text" value={albumForm.name} onChange={(e) => setAlbumForm({ ...albumForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="相册名称" autoFocus /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">别名（可选）</label><input type="text" value={albumForm.slug} onChange={(e) => setAlbumForm({ ...albumForm, slug: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="url-友好别名" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">父级相册</label>
              <SelectField
                aria-label="父级相册"
                value={albumForm.parent_id}
                onChange={(e) => setAlbumForm({ ...albumForm, parent_id: e.target.value })}
              >
                <option value="">无（根级）</option>
                {albums.filter((a) => a.id !== albumModal.editing?.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectField>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6"><button onClick={() => setAlbumModal({ open: false, editing: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">取消</button><button onClick={saveAlbum} className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">{albumModal.editing ? "保存" : "创建"}</button></div>
        </div>
      </Modal>
    </div>
  );
}
