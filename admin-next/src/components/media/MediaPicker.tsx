"use client";
/*
 * 媒体选择器 —— 产品/新闻表单从媒体库选素材的统一入口（替代表单内的直接上传）。
 *
 * 用法：由父组件**条件挂载**（选图期间才渲染本组件），因此内部状态随挂载初始化，
 * 不需要在 effect 里重置；onClose 由父组件负责卸载。
 *
 * 上传归属（满足「编辑用到的图片必有相册归属」且不改后端约束）：
 * - 默认带 categorize=product:{slug} / news:{slug}，复用后端 _resolve_categorize_hint
 *   自动创建/复用 Products/{slug}、News/{slug} 相册；
 * - 也可在下拉里改选已有相册（走 album_id）；不选相册且无 hint 时进入「未分类」。
 *
 * 无障碍与移动端：复用 ui/modal（Esc/遮罩/内部滚动）；390px 下网格 2 列、
 * 相册树收成下拉、按钮触控高度 ≥40px。
 */
import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import AlbumNode from "@/components/media/AlbumTree";
import MediaThumb from "@/components/media/MediaThumb";
import {
  buildTree,
  checkUploadSize,
  formatSize,
  type AlbumListData,
  type PaginatedRecords,
  type PickedMedia,
  type TreeAlbum,
  type UploadRecord,
} from "@/components/media/types";
import SelectField from "@/components/form/SelectField";
import { Modal } from "@/components/ui/modal";

interface MediaPickerProps {
  onClose: () => void;
  /** single：封面等单选场景；multiple：图库/详情图/正文插图 */
  mode: "single" | "multiple";
  /** 上传归属提示：product:{slug} / news:{slug}（复用后端自动建夹逻辑） */
  categorizeHint?: string;
  /** 可选类型：image（默认，表单场景）或 all（含视频） */
  kind?: "image" | "all";
  /** 已选回填（编辑场景；按 id 匹配勾选） */
  initialSelected?: PickedMedia[];
  onConfirm: (picked: PickedMedia[]) => void;
  /** 上传中上报给表单，驱动「上传期间禁用保存」的既有契约 */
  onBusyChange?: (busy: boolean) => void;
}

export default function MediaPicker({
  onClose, mode, categorizeHint, kind = "image", initialSelected, onConfirm, onBusyChange,
}: MediaPickerProps) {
  const toast = useToast();
  const pageSize = 12;
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Map<number, PickedMedia>>(
    () => new Map((initialSelected ?? []).map((item) => [item.id, item])),
  );
  // 上传归属："" = 自动归档（categorizeHint）；否则为指定相册 id
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploading, setUploading] = useState(false);

  const albumsKey = "/admin/albums";
  const { data: albumData, mutate: mutateAlbums } = useSWR<AlbumListData>(albumsKey, swrFetcher);
  const albums = useMemo(() => albumData?.list ?? [], [albumData]);
  const uncategorized = albumData?.uncategorized ?? 0;
  const tree: TreeAlbum[] = useMemo(() => buildTree(albums), [albums]);
  const flatAlbums: { id: number; label: string }[] = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (nodes: TreeAlbum[]) => {
      for (const node of nodes) {
        out.push({ id: node.id, label: `${"　".repeat(node.depth)}${node.name}` });
        walk(node.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  const recordsParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (selectedAlbumId !== null) recordsParams.set("album_id", String(selectedAlbumId));
  if (kind === "image") recordsParams.set("type", "image");
  if (keyword.trim()) recordsParams.set("keyword", keyword.trim());
  const recordsKey = `/admin/upload/records?${recordsParams.toString()}`;
  const { data: recordsData, isLoading, mutate } = useSWR<PaginatedRecords>(recordsKey, swrFetcher);
  const records = recordsData?.list ?? [];
  const total = recordsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 搜索 300ms 防抖（与 audit-logs 的写法一致），变化时回到第一页
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  function changeAlbum(albumId: number | null) {
    setSelectedAlbumId(albumId);
    setPage(1);
  }

  function togglePick(record: UploadRecord) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (mode === "single") {
        next.clear();
        next.set(record.id, { id: record.id, url: record.url, title: record.title });
      } else if (next.has(record.id)) {
        next.delete(record.id);
      } else {
        next.set(record.id, { id: record.id, url: record.url, title: record.title });
      }
      return next;
    });
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files?.length) return;
    setUploading(true);
    onBusyChange?.(true);
    const targetAlbumId = uploadTarget ? Number(uploadTarget) : null;
    let browseAlbum = selectedAlbumId;
    for (const file of Array.from(files)) {
      // accept is only a file-dialog hint; image fields must never receive a video URL.
      if (kind === "image" && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
        toast.error("请选择 JPG、PNG、WebP 或 GIF 图片");
        continue;
      }
      const sizeError = checkUploadSize(file);
      if (sizeError) { toast.error(sizeError); continue; }
      const fd = new FormData(); fd.append("file", file);
      if (targetAlbumId !== null) fd.append("album_id", String(targetAlbumId));
      else if (categorizeHint) fd.append("categorize", categorizeHint);
      try {
        const result = await apiFetch<{ id?: number; url: string; file_name: string; album_id?: number }>("/admin/upload", { method: "POST", body: fd });
        // 上传成功即自动选中，并把浏览位置切到素材所在相册（后端返回 id/album_id）
        if (result.id != null) {
          setPicked((prev) => {
            const next = new Map(mode === "single" ? new Map<number, PickedMedia>() : prev);
            next.set(result.id as number, { id: result.id as number, url: result.url, title: result.file_name });
            return next;
          });
        }
        if (result.album_id != null) browseAlbum = result.album_id;
        else if (categorizeHint && targetAlbumId === null) toast.warning("素材已上传，但自动归档失败，已进入「未分类」");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "上传失败");
      }
    }
    setUploading(false);
    onBusyChange?.(false);
    event.target.value = "";
    // 函数式比较：上传期间用户可能已手动切换相册，不覆盖用户的选择
    setSelectedAlbumId((current) => (browseAlbum !== current ? browseAlbum : current));
    setPage(1);
    await Promise.all([mutate(), mutateAlbums()]);
  }

  function confirm() {
    const list = Array.from(picked.values());
    if (list.length === 0) return;
    onConfirm(list);
  }

  return (
    <Modal isOpen onClose={onClose} className="mx-3 max-w-4xl">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4 dark:bg-gray-900 sm:p-6">
        <h3 className="pr-12 text-lg font-semibold text-gray-800 dark:text-white/90">
          从媒体库选择{kind === "image" ? "图片" : "素材"}
          <span className="ml-2 text-xs font-normal text-gray-400">{mode === "single" ? "单选" : "可多选，按选择顺序插入"}</span>
        </h3>

        <div className="mt-4 flex flex-col gap-4 md:flex-row">
          {/* 相册树（移动端收成下拉，节省纵向空间） */}
          <aside className="max-md:hidden w-48 shrink-0 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 max-h-[55dvh] overflow-y-auto">
            <ul className="space-y-0.5">
              <li>
                <button
                  onClick={() => changeAlbum(null)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === null ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                >
                  全部
                </button>
              </li>
              {uncategorized > 0 && (
                <li>
                  <button
                    onClick={() => changeAlbum(0)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2 ${selectedAlbumId === 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                  >
                    <span>未分类</span>
                    <span className="text-xs tabular-nums">{uncategorized}</span>
                  </button>
                </li>
              )}
              {tree.map((node) => (
                <AlbumNode key={node.id} album={node} selectedAlbumId={selectedAlbumId} onSelect={changeAlbum} />
              ))}
            </ul>
          </aside>

          <div className="min-w-0 flex-1">
            {/* 工具条：搜索 + 相册（移动端）+ 上传归属 + 上传 */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="搜索素材..."
                aria-label="搜索素材"
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:h-9 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
              <div className="md:hidden">
                <SelectField
                  selectSize="sm"
                  className="max-w-[130px]"
                  aria-label="筛选相册"
                  value={selectedAlbumId === null ? "" : String(selectedAlbumId)}
                  onChange={(e) => changeAlbum(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">全部</option>
                  {uncategorized > 0 && <option value="0">未分类</option>}
                  {flatAlbums.map((album) => <option key={album.id} value={album.id}>{album.label}</option>)}
                </SelectField>
              </div>
              <SelectField
                selectSize="sm"
                className="max-w-[190px]"
                aria-label="上传归属相册"
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
              >
                {categorizeHint ? (
                  <option value="">自动归档（{categorizeHint.split(":")[0] === "product" ? "Products" : "News"} / {categorizeHint.split(":")[1] ?? ""}）</option>
                ) : (
                  <option value="">不归档（未分类）</option>
                )}
                {albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
              </SelectField>
              <label className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium cursor-pointer sm:min-h-0 sm:py-1.5 ${uploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-600"}`}>
                {uploading ? "上传中..." : "+ 上传到此相册"}
                <input
                  type="file"
                  aria-label="选择器内上传素材"
                  accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "image/*,video/mp4,video/webm"}
                  multiple
                  onChange={handleUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            <p className="mb-3 text-xs text-gray-400">图片（JPG / PNG / WebP / GIF）≤ 10MB · 视频（MP4 / WebM）≤ 50MB；上传的素材会归入上面选择的相册。</p>

            {/* 网格 */}
            {isLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-900">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : records.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {records.map((record) => {
                    const isSelected = picked.has(record.id);
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => togglePick(record)}
                        aria-pressed={isSelected}
                        aria-label={`选择 ${record.title || record.file_name}`}
                        className={`group relative rounded-xl border-2 overflow-hidden text-left transition-all ${isSelected ? "border-brand-500 bg-brand-50/30 dark:bg-brand-900/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}
                      >
                        <MediaThumb url={record.url} title={record.title || record.file_name} className="aspect-square" />
                        {isSelected && (
                          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white shadow">
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </span>
                        )}
                        <div className="p-2">
                          <p className="mb-0.5 truncate text-xs text-gray-700 dark:text-gray-300">{record.title || record.file_name}</p>
                          <p className="text-[10px] text-gray-400">{formatSize(record.size)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm disabled:opacity-40 hover:bg-gray-50 sm:min-h-0 sm:px-3 sm:py-1.5 dark:border-gray-700 dark:hover:bg-gray-800">上一页</button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} / {totalPages}</span>
                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm disabled:opacity-40 hover:bg-gray-50 sm:min-h-0 sm:px-3 sm:py-1.5 dark:border-gray-700 dark:hover:bg-gray-800">下一页</button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">该相册暂无素材，可用上方按钮直接上传。</p>
              </div>
            )}

            {/* 底部：已选计数 + 操作 */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-300">已选 {picked.size} 项{mode === "multiple" && picked.size > 0 ? `：${Array.from(picked.values()).map((item) => item.url.split("/").pop()).join("、")}` : ""}</span>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 sm:min-h-0 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">取消</button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={uploading || picked.size === 0}
                  className="min-h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
                >
                  {uploading ? "上传中..." : `确定（${picked.size}）`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
