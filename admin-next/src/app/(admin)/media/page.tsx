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

import React, { useCallback, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher, API_BASE } from "@/lib/api-client";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Modal } from "@/components/ui/modal";
import { FolderIcon, PlusIcon, TrashBinIcon } from "@/icons";

// ─────────────────────── 类型 ───────────────────────
interface UploadRecord {
  id: number; url: string; file_name: string; size: number;
  uploaded_by: string | null; album_id: number | null; title: string | null; created_time: string | null;
}
interface Album {
  id: number; name: string; slug: string; sort_order: number; count: number;
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
  const sorted = (list: Album[]) => [...list].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  function walk(parentId: number | null, depth: number): TreeAlbum[] {
    return (byParent.get(parentId) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((a) => ({
      ...a, depth, children: walk(a.id, depth + 1),
    }));
  }
  return walk(null, 0);
}

function usageLabel(item: UsageItem): string {
  const map: Record<string, string> = { product_gallery: "Product gallery", product_cover: "Product cover", news_cover: "News cover" };
  return `${map[item.type] ?? item.type}: ${item.name}`;
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
          <span className="text-[10px] tabular-nums shrink-0 mr-1">{album.count}</span>
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

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [selectedAlbumId, keyword]);

  // 多选
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(records.map((r) => r.id)));
  const toggleSelect = (id: number) => { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); };
  const clearSelection = () => setSelectedIds(new Set());

  // 上传
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return; setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append("file", file);
      if (uploadAlbumId !== null) fd.append("album_id", String(uploadAlbumId));
      try { await apiFetch("/admin/upload", { method: "POST", body: fd }); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    }
    setUploading(false); e.target.value = "";
    await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
  }, [uploadAlbumId, albumsKey, recordsKey, mutate, toast]);

  // 删除
  const handleDelete = async (rec: UploadRecord, force = false) => {
    try { await apiFetch(`/admin/upload/${rec.id}?force=${force}`, { method: "DELETE" }); toast.success("Deleted"); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); clearSelection(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); }
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
  const handleBatchDelete = async () => { const ids = Array.from(selectedIds); let f = 0; for (const id of ids) { try { await apiFetch(`/admin/upload/${id}?force=true`, { method: "DELETE" }); } catch { f++; } } toast.success(`Deleted ${ids.length - f}/${ids.length}`); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); clearSelection(); };
  const copyUrl = (url: string) => { navigator.clipboard.writeText(url); toast.success("Copied!"); };

  // 懒加载引用信息（hover 触发，已缓存则直接返回）
  const fetchUsage = async (recId: number, url: string) => {
    if (usageCache.has(recId)) return;
    try {
      const info = await apiFetch<UsageInfo>(`/admin/upload/${recId}/usage`);
      setUsageCache((prev) => new Map(prev).set(recId, info));
    } catch { /* 忽略 */ }
  };

  // 相册 CRUD
  const openCreateAlbum = () => { setAlbumForm({ name: "", slug: "", parent_id: "" }); setAlbumModal({ open: true, editing: null }); };
  const openEditAlbum = (a: Album) => { setAlbumForm({ name: a.name, slug: a.slug, parent_id: a.parent_id?.toString() ?? "" }); setAlbumModal({ open: true, editing: a }); };
  const saveAlbum = async () => {
    if (!albumForm.name.trim()) { toast.error("Name required"); return; }
    const body: Record<string, unknown> = { name: albumForm.name.trim(), slug: albumForm.slug.trim() || undefined };
    const pid = albumForm.parent_id ? Number(albumForm.parent_id) : null;
    if (albumModal.editing) { body.parent_id = pid === albumModal.editing.id ? undefined : pid; } else { body.parent_id = pid || undefined; }
    try {
      if (albumModal.editing) { await apiFetch(`/admin/albums/${albumModal.editing.id}`, { method: "PUT", body }); toast.success("Album updated"); }
      else { await apiFetch("/admin/albums", { method: "POST", body }); toast.success("Album created"); }
      setAlbumModal({ open: false, editing: null }); await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
  };
  const deleteAlbum = async (a: Album) => {
    const childCount = a.count; // 注意：count 只含直系素材，不含子相册素材（后端聚合只按 album_id 分组）
    setConfirm({ title: "删除相册", message: `确定删除「${a.name}」吗？其中的 ${childCount} 个素材将变为"未分类"，所有子相册也将被级联删除。`, confirmText: "删除相册",
      onConfirm: async () => { try { await apiFetch(`/admin/albums/${a.id}`, { method: "DELETE" }); toast.success("Deleted"); if (selectedAlbumId === a.id) setSelectedAlbumId(null); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); } catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); } setConfirm(null); } });
  };

  // ─────────────────────── 渲染 ───────────────────────
  return (
    <div className="flex gap-6 items-start">
      {/* 左侧树形相册 */}
      <aside className="w-56 shrink-0 bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Albums</h3>
          <button onClick={openCreateAlbum} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="New Album"><PlusIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <ul className="space-y-0.5">
          <li><button onClick={() => setSelectedAlbumId(null)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === null ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className="flex items-center gap-2"><FolderIcon className="w-4 h-4" />All</span><span className="text-xs tabular-nums">{albumData ? albumData.list.reduce((s,a)=>s+a.count,0)+uncategorized : 0}</span></button></li>
          {uncategorized > 0 && (
            <li><button onClick={() => setSelectedAlbumId(0)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className="flex items-center gap-2"><FolderIcon className="w-4 h-4 opacity-50" />Uncategorized</span><span className="text-xs tabular-nums">{uncategorized}</span></button></li>
          )}
          {tree.map((node) => <AlbumNode key={node.id} album={node} selectedAlbumId={selectedAlbumId} onSelect={setSelectedAlbumId} onEdit={openEditAlbum} onDelete={deleteAlbum} />)}
        </ul>
      </aside>

      {/* 主内容 */}
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">Media Library</h2>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx={11} cy={11} r={8}/><path d="m21 21-4.3-4.3" strokeLinecap="round"/></svg>
            <input type="text" placeholder="Search..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <select value={uploadAlbumId ?? ""} onChange={(e) => setUploadAlbumId(e.target.value ? Number(e.target.value) : null)} className="text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-2 max-w-[140px]">
            <option value="">No album</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${uploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600"}`}>
            {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</> : <><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg> Upload</>}
            <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          {/* 同步按钮：补齐 product/news 引用图片的记录 */}
          <button
            onClick={async () => {
              try {
                const r = await apiFetch<{ found: number; synced: number }>("/admin/upload/sync", { method: "POST" });
                toast.success(`Synced ${r.synced}/${r.found} images`);
                await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
              } catch (err) { toast.error(err instanceof Error ? err.message : "Sync failed"); }
            }}
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Scan products & news for image references not yet tracked"
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="inline mr-1"><path d="M21 12a9 9 0 11-6.219-8.56"/><path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Sync
          </button>
          {/* 自动归���按钮 */}
          <button
            onClick={async () => {
              try {
                const r = await apiFetch<{ categorized: number; albums_created: number }>("/admin/upload/auto-categorize", { method: "POST" });
                toast.success(`Categorized ${r.categorized} images into ${r.albums_created} albums`);
                await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
              } catch (err) { toast.error(err instanceof Error ? err.message : "Categorize failed"); }
            }}
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Auto-categorize uncategorized images by product/news path"
          >
            <FolderIcon className="w-3 h-3 inline mr-1" />
            Categorize
          </button>
          {selectedIds.size > 0 && (<><span className="text-xs text-gray-500 ml-2">{selectedIds.size} selected</span><button onClick={() => setConfirm({ title: "批量删除", message: `删除选中 ${selectedIds.size} 个文件？不可撤销。`, confirmText: `Delete ${selectedIds.size}`, onConfirm: () => { handleBatchDelete(); setConfirm(null); } })} className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"><TrashBinIcon className="w-3.5 h-3.5 inline mr-1" /> Delete</button></>)}
        </div>

        {total === 0 && !isLoading && (
          <label className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors mb-4">
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-gray-300 dark:text-gray-600"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">Drag & drop or click to upload</p><p className="text-xs text-gray-400">JPG/PNG/WebP/GIF · Max 10MB</p>
            <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}

        {isLoading ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : records.length > 0 ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-3 mb-3 px-1"><label className="flex items-center gap-1.5 cursor-pointer select-none"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /><span className="text-xs text-gray-500">{allSelected ? "Deselect" : "Select all"}</span></label><span className="text-xs text-gray-400 ml-auto">{total} files</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {records.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                return (
                  <div key={rec.id} className={`group relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${isSelected ? "border-brand-500 bg-brand-50/30 dark:bg-brand-900/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`} onClick={() => toggleSelect(rec.id)} onMouseEnter={() => fetchUsage(rec.id, rec.url)}>
                    <div className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}><input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded border-white bg-white/80 text-brand-500 focus:ring-brand-500 shadow-sm" /></div>
                    <div className="aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800"><img src={`${API_BASE}${rec.url}`} alt={rec.title || rec.file_name} className="w-full h-full object-cover" loading="lazy" /></div>
                    <div className="p-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5">{rec.title || rec.file_name}</p>
                      <p className="text-[10px] text-gray-400 mb-1.5">{formatSize(rec.size)}</p>
                      {/* 引用标签：hover 后懒加载，有引用则显示蓝色标签 */}
                      {usageCache.has(rec.id) && usageCache.get(rec.id)!.in_use ? (
                        <div className="mb-1.5" title={usageCache.get(rec.id)!.items.map(usageLabel).join("\n")}>
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            {usageCache.get(rec.id)!.count}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); copyUrl(`${API_BASE}${rec.url}`); }} className="flex-1 text-[11px] py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">Copy</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(rec); }} className="text-[11px] py-1 px-2 rounded bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"><TrashBinIcon className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5"><button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Prev</button><span className="text-sm text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span><button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Next</button></div>
            )}
          </div>
        ) : recordsData ? (<div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center"><p className="text-gray-400 dark:text-gray-600 text-sm">{keyword ? "No files match your search." : "No files in this album."}</p></div>) : null}
      </div>

      {/* 对话框 */}
      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ""} message={confirm?.message ?? ""} onConfirm={confirm?.onConfirm ?? (() => {})} onCancel={() => setConfirm(null)} confirmText={confirm?.confirmText ?? "Delete"} />

      <Modal isOpen={albumModal.open} onClose={() => setAlbumModal({ open: false, editing: null })}>
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">{albumModal.editing ? "Edit Album" : "New Album"}</h3>
          <div className="space-y-3">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label><input type="text" value={albumForm.name} onChange={(e) => setAlbumForm({ ...albumForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="Album name" autoFocus /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug (optional)</label><input type="text" value={albumForm.slug} onChange={(e) => setAlbumForm({ ...albumForm, slug: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="url-friendly-slug" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parent Album</label>
              <select value={albumForm.parent_id} onChange={(e) => setAlbumForm({ ...albumForm, parent_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                <option value="">None (root)</option>
                {albums.filter((a) => a.id !== albumModal.editing?.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6"><button onClick={() => setAlbumModal({ open: false, editing: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">Cancel</button><button onClick={saveAlbum} className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">{albumModal.editing ? "Save" : "Create"}</button></div>
        </div>
      </Modal>
    </div>
  );
}
