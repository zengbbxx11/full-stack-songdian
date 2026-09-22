/*
 * 页面：媒体管理页 v3（/media）—— Loop 2：树形相册 + 引用追踪
 *
 * 职责：
 * - 左侧树形相册侧边栏：All / 未分类 / 层级相册（展开/折叠），支持新建子目录/改名/删除
 * - 顶部工具栏：搜索框 + 类型筛选（图片/视频）+ 上传按钮 + 全选
 * - 媒体网格：图片缩略图 / 视频首帧（点击预览播放）+ 标题 + Copy URL + "Used in" 引用标签 + 删除
 * - 删除保护：查引用明细（含产品/新闻名称），弹窗告警后仍可强制删除
 */
"use client";
// 缩略图统一走 components/media/MediaThumb（原生 img 的 eslint 豁免也在那里）。

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher, resolveMediaUrl } from "@/lib/api-client";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SelectField from "@/components/form/SelectField";
import { Modal } from "@/components/ui/modal";
import AlbumNode from "@/components/media/AlbumTree";
import MediaThumb from "@/components/media/MediaThumb";
import {
  ALBUM_ARROW_SLOT,
  ALBUM_ICON_CLASS,
  ALBUM_ROW_GAP_CLASS,
  ALBUM_ROW_PAD,
  albumChainIds,
  albumPath,
  buildTree,
  checkUploadSize,
  descendantIds,
  formatSize,
  isVideoUrl,
  reorderSiblings,
  slugifyAlbumName,
  type Album,
  type AlbumListData,
  type PaginatedRecords,
  type UploadRecord,
} from "@/components/media/types";
import { FolderIcon, PlusIcon, TrashBinIcon } from "@/icons";

// ─────────────────────── 类型（媒体/相册的共享类型见 components/media/types.ts） ───────────────────────
interface UsageItem { type: "product_gallery" | "product_cover" | "news_cover" | "product_content" | "news_content" | "home_banner"; name: string; id: number | string }
interface UsageInfo { count: number; items: UsageItem[]; in_use: boolean }

// 引用类型 → 中文标签（列表与弹窗共用，避免两处映射漂移）
const USAGE_TYPE_LABEL: Record<UsageItem["type"], string> = {
  product_gallery: "产品图库",
  product_cover: "产品封面",
  news_cover: "新闻封面",
  product_content: "产品正文",
  news_content: "新闻正文",
  home_banner: "首页轮播",
};

function usageLabel(item: UsageItem): string {
  return `${USAGE_TYPE_LABEL[item.type] ?? item.type}: ${item.name}`;
}

function usageEditHref(item: UsageItem): string {
  if (item.type === "home_banner") return "/settings";
  return item.type === "news_cover" || item.type === "news_content" ? `/news-form?id=${item.id}` : `/product-form?id=${item.id}`;
}

// 视频时长（秒）→ 「x 分 xx 秒」；metadata 读取失败时显示「未知」
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "未知";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes} 分 ${String(rest).padStart(2, "0")} 秒` : `${rest} 秒`;
}

// ─────────────────────── 主组件 ───────────────────────
export default function MediaPage() {
  const toast = useToast(); const { mutate } = useSWRConfig();
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState(""); const [page, setPage] = useState(1); const pageSize = 20;
  // 类型筛选："" = 全部 / "image" / "video"（与后端 records 接口的 type 参数对齐）
  const [typeFilter, setTypeFilter] = useState("");
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
  // 视频预览弹窗（时长由浏览器读 metadata，网格内不预取，避免一页 N 个 metadata 请求）
  const [previewRecord, setPreviewRecord] = useState<UploadRecord | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  // 移动端（<768px）相册筛选面板是否展开；桌面端侧栏常驻，该 state 不生效
  const [albumsOpen, setAlbumsOpen] = useState(false);
  // 相册树的展开集合：受控传给 AlbumNode。新建相册后要把祖先链一次性展开，否则新相册
  // 藏在折叠的父节点里，看起来像「没建成」。
  const [expandedAlbumIds, setExpandedAlbumIds] = useState<Set<number>>(new Set());
  // 同级拖动排序：正在拖的相册与当前悬停的目标（纯本地状态，松手才发一次请求）
  const albumOrderSavingRef = useRef(false);
  const [albumOrderSaving, setAlbumOrderSaving] = useState(false);
  const [dragAlbumId, setDragAlbumId] = useState<number | null>(null);
  const [dragOverAlbumId, setDragOverAlbumId] = useState<number | null>(null);

  // ---- 数据 ----
  const albumsKey = "/admin/albums";
  const { data: albumData } = useSWR<AlbumListData>(albumsKey, swrFetcher);
  const albums = albumData?.list ?? [];
  const uncategorized = albumData?.uncategorized ?? 0;
  const tree = buildTree(albums);

  const recordsParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (selectedAlbumId !== null) recordsParams.set("album_id", String(selectedAlbumId));
  if (keyword.trim()) recordsParams.set("keyword", keyword.trim());
  if (typeFilter) recordsParams.set("type", typeFilter);
  const recordsKey = `/admin/upload/records?${recordsParams.toString()}`;
  const { data: recordsData, isLoading } = useSWR<PaginatedRecords>(recordsKey, swrFetcher);
  const records = recordsData?.list ?? []; const total = recordsData?.total ?? 0; const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectAlbum = (albumId: number | null) => {
    setSelectedAlbumId(albumId);
    setPage(1);
    setSelectedIds(new Set());
  };

  // 从移动端折叠面板里选相册：选完自动收起，让图片区立刻可见
  const selectAlbumFromPanel = (albumId: number | null) => {
    selectAlbum(albumId);
    setAlbumsOpen(false);
  };

  const toggleAlbumOpen = (albumId: number) => setExpandedAlbumIds((prev) => {
    const next = new Set(prev);
    if (next.has(albumId)) next.delete(albumId);
    else next.add(albumId);
    return next;
  });

  // 移动端筛选开关上显示的当前相册（桌面端不展示这个开关）
  const currentAlbumLabel = selectedAlbumId === null
    ? "全部"
    : selectedAlbumId === 0
      ? "未分类"
      : albums.find((a) => a.id === selectedAlbumId)?.name ?? "全部";

  const changeKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
    setSelectedIds(new Set());
  };

  // 类型筛选变化同样必须回到第一页（AGENTS「筛选条件变化时重置页码」）
  const changeType = (value: string) => {
    setTypeFilter(value);
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

  // 上传（图片 + 视频）：体积按类型预检（图片 ≤10MB / 视频 ≤50MB），超限不发请求直接提示
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return; setUploading(true);
    for (const file of Array.from(files)) {
      const sizeError = checkUploadSize(file);
      if (sizeError) { toast.error(sizeError); continue; }
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

  // 打开视频预览（时长在弹窗里由浏览器读 metadata）
  const openPreview = (rec: UploadRecord) => { setPreviewRecord(rec); setPreviewDuration(null); };

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

  // 相册 CRUD（排序已改为侧栏拖动 / 上移下移，弹窗不再暴露排序数字）
  const openCreateAlbum = () => {
    // 默认挂在「当前正在浏览的相册」下（全部 / 未分类不是具体相册 → 根级），仍可在下拉里改
    const currentParent = selectedAlbumId !== null && selectedAlbumId > 0 ? String(selectedAlbumId) : "";
    setAlbumForm({ name: "", slug: "", parent_id: currentParent });
    setAlbumModal({ open: true, editing: null });
  };
  const openEditAlbum = (a: Album) => { setAlbumForm({ name: a.name, slug: a.slug, parent_id: a.parent_id?.toString() ?? "" }); setAlbumModal({ open: true, editing: a }); };
  const saveAlbum = async () => {
    if (!albumForm.name.trim()) { toast.error("请输入名称"); return; }
    // 别名只允许英文/数字（后端同规则，中文会被剥成空串）：先在本地拦下，免得多跑一次请求
    if (albumForm.slug.trim() && !slugifyAlbumName(albumForm.slug)) { toast.error("别名只能包含英文字母、数字（中文请留空，系统会自动生成）"); return; }
    const body: Record<string, unknown> = { name: albumForm.name.trim(), slug: albumForm.slug.trim() || undefined };
    const pid = albumForm.parent_id ? Number(albumForm.parent_id) : null;
    if (albumModal.editing) { body.parent_id = pid === albumModal.editing.id ? undefined : pid; } else { body.parent_id = pid || undefined; }
    try {
      if (albumModal.editing) { await apiFetch(`/admin/albums/${albumModal.editing.id}`, { method: "PUT", body }); toast.success("相册已更新"); }
      else {
        const created = await apiFetch<Album>("/admin/albums", { method: "POST", body });
        toast.success("相册已创建");
        setAlbumModal({ open: false, editing: null });
        // 相册已落库，后面的列表重新校验只影响新鲜度：失败不能把「已创建」报成「保存失败」。
        await mutate(albumsKey).catch(() => undefined);
        // 建完就地定位：选中新相册并展开它的父级链，否则新相册藏在折叠的父节点里，像「没建成」
        if (created?.id) {
          selectAlbum(created.id);
          const ancestorIds = albumChainIds(albums, created.parent_id ?? null);
          if (ancestorIds.length > 0) setExpandedAlbumIds((prev) => new Set([...prev, ...ancestorIds]));
        }
        void mutate(recordsKey).catch(() => undefined);
        return;
      }
      setAlbumModal({ open: false, editing: null });
      await Promise.all([mutate(albumsKey), mutate(recordsKey)]);
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存失败"); }
  };
  const deleteAlbum = async (a: Album) => {
    // total_count 含子相册素材（后端已按子树合计）；删除父相册会级联删除整棵子树，
    // 因此这里展示的是"本次操作影响到的素材总数"，避免只报直系数造成低估。
    const affected = a.total_count ?? a.count;
    setConfirm({ title: "删除相册", message: `确定删除「${a.name}」吗？其中的 ${affected} 个素材将变为"未分类"，所有子相册也将被级联删除。`, confirmText: "删除相册",
      onConfirm: async () => { try { await apiFetch(`/admin/albums/${a.id}`, { method: "DELETE" }); toast.success("已删除"); if (selectedAlbumId === a.id) setSelectedAlbumId(null); await Promise.all([mutate(albumsKey), mutate(recordsKey)]); } catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); } setConfirm(null); } });
  };

  // ── 同级拖动排序（仅同一父相册内生效；跨父级拖动一律忽略，改父级走编辑弹窗） ──
  // 同级按与 buildTree 相同的键排序（sort_order 升序、并列按 id），这样无论缓存数组顺序如何，
  // 拖动的 from/to 下标都与侧栏渲染顺序一致。
  const albumSiblings = (album: Album) => albums
    .filter((a) => (a.parent_id ?? null) === (album.parent_id ?? null))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const applyAlbumOrder = async (parentId: number | null, ordered: Album[]) => {
    if (albumOrderSavingRef.current) return;
    albumOrderSavingRef.current = true;
    setAlbumOrderSaving(true);
    const ids = ordered.map((a) => a.id);
    const orderOf = new Map(ids.map((id, index) => [id, index]));
    // 侧栏按 sort_order 渲染：先就地把下标写进缓存，顺序立刻变化，再发请求持久化
    try {
      await mutate<AlbumListData>(
        albumsKey,
        (current) => current
          ? { ...current, list: current.list.map((a) => (orderOf.has(a.id) ? { ...a, sort_order: orderOf.get(a.id)! } : a)) }
          : current,
        { revalidate: false },
      );
      await apiFetch("/admin/albums/sort", { method: "PUT", body: { parent_id: parentId, ids } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "排序保存失败");
    }
    // 无论成功与否都以服务端顺序为准：失败即回滚，成功即拿回最新数据
    await mutate(albumsKey).catch(() => undefined);
    albumOrderSavingRef.current = false;
    setAlbumOrderSaving(false);
  };

  const moveAlbum = (albumId: number, delta: number) => {
    const album = albums.find((a) => a.id === albumId);
    if (!album) return;
    const siblings = albumSiblings(album);
    const from = siblings.findIndex((a) => a.id === albumId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= siblings.length) return;
    void applyAlbumOrder(album.parent_id ?? null, reorderSiblings(siblings, from, to));
  };

  const dropAlbum = (targetId: number) => {
    const sourceId = dragAlbumId;
    setDragAlbumId(null);
    setDragOverAlbumId(null);
    const source = sourceId === null ? undefined : albums.find((a) => a.id === sourceId);
    const target = albums.find((a) => a.id === targetId);
    if (!source || !target || source.id === target.id) return;
    // 跨父级拖动不改父子关系（把相册拖进别的相册请用「编辑相册」里的父级下拉）
    if ((source.parent_id ?? null) !== (target.parent_id ?? null)) return;
    const siblings = albumSiblings(source);
    const from = siblings.findIndex((a) => a.id === source.id);
    const to = siblings.findIndex((a) => a.id === target.id);
    if (from < 0 || to < 0) return;
    void applyAlbumOrder(source.parent_id ?? null, reorderSiblings(siblings, from, to));
  };

  const albumSortable = {
    busy: albumOrderSaving,
    draggingId: dragAlbumId,
    overId: dragOverAlbumId,
    onDragStart: (id: number) => setDragAlbumId(id),
    onDragOver: (id: number) => setDragOverAlbumId(id),
    onDragEnd: () => { setDragAlbumId(null); setDragOverAlbumId(null); },
    onDrop: dropAlbum,
    onMove: moveAlbum,
  };

  // ── 相册弹窗的派生状态：父级候选 / 同级重名提示 / 别名预览 ──
  const editingAlbumId = albumModal.editing?.id;
  // 编辑时排除自身与全部子孙：挂到自己的子孙下会成环，成环的子树会从树视图整体消失（后端也拒绝）
  const blockedParentIds = editingAlbumId === undefined ? new Set<number>() : descendantIds(albums, editingAlbumId);
  // 下拉按完整层级路径展示，避免同名/深层相册无法分辨
  const parentAlbumOptions = albums
    .filter((a) => !blockedParentIds.has(a.id))
    .map((a) => ({ album: a, path: albumPath(albums, a.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  const selectedParentId = albumForm.parent_id ? Number(albumForm.parent_id) : null;
  const trimmedAlbumName = albumForm.name.trim();
  // 同级重名只提示不阻断（同名相册是合理场景：两次导入同一个产品）
  const duplicateAlbum = trimmedAlbumName
    ? albums.find((a) => a.name === trimmedAlbumName && (a.parent_id ?? null) === selectedParentId && a.id !== editingAlbumId)
    : undefined;
  const slugPreview = slugifyAlbumName(albumForm.slug);
  const slugInvalid = albumForm.slug.trim() !== "" && slugPreview === "";
  const suggestedSlug = slugifyAlbumName(trimmedAlbumName);

  // ─────────────────────── 渲染 ───────────────────────
  return (
    // <768px 相册不与图片区并排（并排会把主区压到约 130px），改为可折叠的筛选面板
    <div className="flex flex-col gap-3 items-start md:flex-row md:gap-6">
      {/* 移动端相册筛选开关（≥768px 隐藏，侧栏常驻） */}
      <button
        type="button"
        onClick={() => setAlbumsOpen((open) => !open)}
        aria-expanded={albumsOpen}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 md:hidden dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
      >
        <span className="flex min-w-0 items-center gap-2"><FolderIcon className="w-4 h-4 shrink-0" /><span className="truncate">相册：{currentAlbumLabel}</span></span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${albumsOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {/* 左侧树形相册（移动端折叠、桌面端固定宽度侧栏） */}
      {/* 相册名 + 计数 + 4 个操作按钮在 224px 下太挤（名字只剩几个字），故加宽：
          ≥1024px 用 288px；768–1023px 这段主内容区本来就窄，退回 256px 免得把图片网格压得太小。 */}
      <aside aria-label="相册" className={`w-full shrink-0 bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 max-h-[60vh] overflow-y-auto md:block md:w-64 lg:w-72 md:max-h-[calc(100vh-120px)] ${albumsOpen ? "" : "max-md:hidden"}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">相册</h3>
          <button onClick={openCreateAlbum} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" title="新建相册" aria-label="新建相册"><PlusIcon className="w-4 h-4 text-gray-400" /></button>
        </div>
        <ul className="space-y-0.5">
          {/* 「全部 / 未分类」用与相册节点一致的行模板（左侧同样留出展开箭头槽），
              否则它们的文字会比根级相册靠左，看起来像「相册低了一级」 */}
          <li><button onClick={() => selectAlbumFromPanel(null)} style={{ paddingLeft: ALBUM_ROW_PAD, paddingRight: 4 }} className={`w-full text-left py-1.5 rounded-lg text-sm flex items-center justify-between gap-1 ${selectedAlbumId === null ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className={`flex items-center min-w-0 ${ALBUM_ROW_GAP_CLASS}`}><span className="shrink-0" style={{ width: ALBUM_ARROW_SLOT }} /><FolderIcon className={ALBUM_ICON_CLASS} /><span className="truncate">全部</span></span><span className="text-xs tabular-nums shrink-0">{albumData ? albumData.list.filter((a) => a.parent_id === null).reduce((s, a) => s + (a.total_count ?? a.count), 0) + uncategorized : 0}</span></button></li>
          {uncategorized > 0 && (
            <li><button onClick={() => selectAlbumFromPanel(0)} style={{ paddingLeft: ALBUM_ROW_PAD, paddingRight: 4 }} className={`w-full text-left py-1.5 rounded-lg text-sm flex items-center justify-between gap-1 ${selectedAlbumId === 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}><span className={`flex items-center min-w-0 ${ALBUM_ROW_GAP_CLASS}`}><span className="shrink-0" style={{ width: ALBUM_ARROW_SLOT }} /><FolderIcon className={`${ALBUM_ICON_CLASS} opacity-50`} /><span className="truncate">未分类</span></span><span className="text-xs tabular-nums shrink-0">{uncategorized}</span></button></li>
          )}
          {tree.map((node, nodeIndex) => <AlbumNode key={node.id} album={node} selectedAlbumId={selectedAlbumId} onSelect={selectAlbumFromPanel} onEdit={openEditAlbum} onDelete={deleteAlbum} openIds={expandedAlbumIds} onToggleOpen={toggleAlbumOpen} index={nodeIndex} siblingCount={tree.length} sortable={albumSortable} />)}
        </ul>
        <p className="mt-3 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
          <span className="max-md:hidden">拖动相册可调整同级顺序</span>
          <span className="md:hidden">用 ↑ ↓ 按钮调整同级顺序</span>
        </p>
      </aside>

      {/* 主内容 */}
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">媒体库</h2>
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300">
          产品表单上传的图片会自动归入 <strong>Products / 产品别名</strong>，新闻封面会归入 <strong>News / 新闻别名</strong>；上传前未填写别名的图片会进入“未分类”。相册只用于整理，不会改变图片 URL。
        </div>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* min-w-[200px] 在窄主区会撑破父容器，移动端改为占满一行、不再设最小宽度 */}
          <div className="relative w-full min-w-0 flex-1 sm:max-w-sm">
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
          {/* 类型筛选（全部/图片/视频）：走后端 records 的 type 参数，变化时重置页码 */}
          <SelectField
            selectSize="sm"
            className="max-w-[120px]"
            aria-label="素材类型"
            value={typeFilter}
            onChange={(e) => changeType(e.target.value)}
          >
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </SelectField>
          <label className={`inline-flex min-h-10 items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${uploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600"}`}>
            {uploading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 上传中...</> : <><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg> 上传</>}
            <input type="file" accept="image/*,video/mp4,video/webm" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
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
            className="min-h-10 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
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
            className="min-h-10 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Auto-categorize uncategorized images by product/news path"
          >
            <FolderIcon className="w-3 h-3 inline mr-1" />
            自动归类
          </button>
          {selectedIds.size > 0 && (<><span className="text-xs text-gray-500 ml-2">已选择 {selectedIds.size} 项</span><button onClick={() => void handleBatchDelete()} className="min-h-10 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"><TrashBinIcon className="w-3.5 h-3.5 inline mr-1" /> 批量删除</button></>)}
        </div>

        {total === 0 && !isLoading && (
          <label className="flex flex-col items-center gap-3 p-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors mb-4">
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-gray-300 dark:text-gray-600"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">拖拽文件到此处，或点击上传</p><p className="text-xs text-gray-400">图片（JPG / PNG / WebP / GIF）≤ 10MB · 视频（MP4 / WebM）≤ 50MB</p>
            <input type="file" accept="image/*,video/mp4,video/webm" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}

        {isLoading ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : records.length > 0 ? (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3 px-1"><label className="flex min-h-10 items-center gap-1.5 cursor-pointer select-none sm:min-h-0"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /><span className="text-xs text-gray-500">{allSelected ? "取消全选" : "全选"}</span></label><span className="text-xs text-gray-400 ml-auto">共 {total} 个文件</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {records.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                return (
                  <div key={rec.id} className={`group relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${isSelected ? "border-brand-500 bg-brand-50/30 dark:bg-brand-900/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`} onClick={() => toggleSelect(rec.id)} onMouseEnter={() => fetchUsage(rec.id)}>
                    <div className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}><input type="checkbox" checked={isSelected} readOnly aria-label={`选择 ${rec.title || rec.file_name}`} className="w-4 h-4 rounded border-white bg-white/80 text-brand-500 focus:ring-brand-500 shadow-sm" /></div>
                    <MediaThumb
                      url={rec.url}
                      title={rec.title || rec.file_name}
                      className="aspect-square"
                      onOpenPreview={isVideoUrl(rec.url) ? () => openPreview(rec) : undefined}
                    />
                    <div className="p-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate mb-0.5">{rec.title || rec.file_name}</p>
                      <p className="text-[10px] text-gray-400 mb-1.5">{formatSize(rec.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void openUsage(rec); }}
                        className={`mb-1.5 flex w-full items-center justify-between rounded px-1.5 py-1 text-[10px] transition-colors max-md:min-h-9 max-md:text-[11px] ${
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
                        <button onClick={(e) => { e.stopPropagation(); copyUrl(resolveMediaUrl(rec.url)); }} className="flex-1 text-[11px] py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 max-md:min-h-9 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">复制</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(rec); }} aria-label={`删除 ${rec.title || rec.file_name}`} className="text-[11px] py-1 px-2 rounded bg-red-50 text-red-500 hover:bg-red-100 max-md:min-h-9 max-md:px-3 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"><TrashBinIcon className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5"><button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="min-h-10 px-4 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 sm:min-h-0 sm:px-3 sm:py-1.5 dark:hover:bg-gray-800">上一页</button><span className="text-sm text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span><button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="min-h-10 px-4 text-sm border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 sm:min-h-0 sm:px-3 sm:py-1.5 dark:hover:bg-gray-800">下一页</button></div>
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
            <h3 className="pr-12 text-lg font-semibold text-gray-800 dark:text-white/90">素材使用情况</h3>
            <div className="mt-5 flex gap-4 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
              <MediaThumb url={usageModal.record.url} title={usageModal.record.title || usageModal.record.file_name} className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700" />
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

      {/* 视频预览：controls 播放，时长由浏览器读 metadata（不引入 ffmpeg） */}
      <Modal isOpen={!!previewRecord} onClose={() => setPreviewRecord(null)} className="mx-3 max-w-2xl">
        {previewRecord && (
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 dark:bg-gray-900 sm:p-6">
            <h3 className="pr-12 text-lg font-semibold text-gray-800 dark:text-white/90">{previewRecord.title || previewRecord.file_name}</h3>
            <video
              key={previewRecord.id}
              src={resolveMediaUrl(previewRecord.url)}
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              className="mt-4 max-h-[60dvh] w-full rounded-xl bg-black"
              onLoadedMetadata={(e) => setPreviewDuration(e.currentTarget.duration)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
              <span>体积：{formatSize(previewRecord.size)}</span>
              <span>时长：{previewDuration === null ? "读取中…" : formatDuration(previewDuration)}</span>
              <button type="button" onClick={() => copyUrl(resolveMediaUrl(previewRecord.url))} className="ml-auto rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600 hover:bg-gray-200 max-md:min-h-9 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">复制地址</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 传 className 限制面板宽度并留出屏幕边距：Modal 基类默认 w-full 无 max-w，
          之前靠内层 max-w-sm 限制但未居中，窄屏上贴左显示。 */}
      <Modal isOpen={albumModal.open} onClose={() => setAlbumModal({ open: false, editing: null })} className="mx-3 max-w-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">{albumModal.editing ? "编辑相册" : "新建相册"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称</label>
              <input type="text" value={albumForm.name} onChange={(e) => setAlbumForm({ ...albumForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="相册名称" autoFocus />
              {duplicateAlbum && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">同级已有同名相册「{duplicateAlbum.name}」，仍可创建，但建议改名以便区分。</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">别名（可选）</label>
              <input
                type="text" value={albumForm.slug} onChange={(e) => setAlbumForm({ ...albumForm, slug: e.target.value })}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${slugInvalid ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-700"}`}
                placeholder={suggestedSlug || "留空自动生成"}
              />
              <p className={`mt-1 text-xs ${slugInvalid ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
                {slugInvalid
                  ? "别名只能包含英文字母、数字，请修改或留空（中文会被自动去掉）。"
                  : albumForm.slug.trim()
                    ? `实际保存为：${slugPreview}`
                    : suggestedSlug ? `留空则自动生成：${suggestedSlug}` : "留空则由系统按名称生成（纯中文名会生成随机别名）。"}
              </p>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">父级相册</label>
              <SelectField
                aria-label="父级相册"
                value={albumForm.parent_id}
                onChange={(e) => setAlbumForm({ ...albumForm, parent_id: e.target.value })}
              >
                <option value="">无（根级）</option>
                {parentAlbumOptions.map(({ album: option, path }) => <option key={option.id} value={option.id}>{path}</option>)}
              </SelectField>
              {blockedParentIds.size > 1 && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">已隐藏该相册自身及其 {blockedParentIds.size - 1} 个子相册（挂上去会形成循环）。</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6"><button onClick={() => setAlbumModal({ open: false, editing: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">取消</button><button onClick={saveAlbum} className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">{albumModal.editing ? "保存" : "创建"}</button></div>
        </div>
      </Modal>
    </div>
  );
}
