/*
 * 媒体库共享类型与工具 —— 媒体页（app/(admin)/media）与媒体选择器（MediaPicker）共用。
 * 类型与后端 uploads 域的 VO 对齐（backend/uploads/schemas.py）。
 */
import { resolveMediaUrl } from "@/lib/api-client";

export interface UploadRecord {
  id: number; url: string; file_name: string; size: number;
  uploaded_by: string | null; album_id: number | null; title: string | null; created_time: string | null;
}

export interface Album {
  id: number; name: string; slug: string; sort_order: number;
  // count：直系素材数；total_count：含全部子相册的合计（侧边栏展示用）。
  count: number; total_count?: number;
  parent_id: number | null; created_time: string | null;
}

export interface TreeAlbum extends Album { children: TreeAlbum[]; depth: number }

export interface AlbumListData { list: Album[]; total: number; uncategorized: number }

export interface PaginatedRecords { list: UploadRecord[]; total: number; page: number; page_size: number }

/** 选择器与表单之间传递的选中项：id 用于回显勾选，url 用于落库，title 用作 alt 兜底。 */
export interface PickedMedia { id: number; url: string; title?: string | null }

/** 读取库内图片的实际宽高（官网据此预留比例），与「上传前 createImageBitmap 读宽高」口径一致。 */
export async function measureImage(url: string): Promise<{ width: number; height: number }> {
  const response = await fetch(resolveMediaUrl(url));
  if (!response.ok) throw new Error(`图片读取失败（${response.status}）`);
  const bitmap = await createImageBitmap(await response.blob());
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

// 上传体积上限（MB）：与后端 settings.max_upload_mb / max_upload_video_mb 的默认值保持一致。
// 仅用于上传前的客户端预检，后端仍是权威校验（见 backend/uploads/services.py 的分类型限额）。
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 50;

const VIDEO_RE = /\.(mp4|webm)(?:[?#]|$)/i;

/** 按扩展名判定视频 —— 与后端 _build_upload_filter 的口径一致（mp4 / webm）。 */
export function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(url);
}

/** 上传前的客户端体积预检：返回错误文案，通过则返回 null。 */
export function checkUploadSize(file: File): string | null {
  const limitMb = isVideoUrl(file.name) ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limitMb * 1024 * 1024) {
    return `${file.name}：${isVideoUrl(file.name) ? "视频" : "图片"}大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 ${limitMb}MB 上限`;
  }
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 扁平相册列表 → 层级树（按 sort_order、id 稳定排序）。 */
export function buildTree(albums: Album[]): TreeAlbum[] {
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

/** 从某个相册向上到根的链（根→叶顺序，含自身）；id 缺失或数据成环时提前收敛。 */
export function albumChain(albums: Album[], albumId: number | null): Album[] {
  if (albumId === null) return [];
  const byId = new Map(albums.map((a) => [a.id, a]));
  const chain: Album[] = [];
  const seen = new Set<number>();
  let cursor: number | null = albumId;
  while (cursor !== null && !seen.has(cursor)) {
    const album = byId.get(cursor);
    if (!album) break;
    seen.add(cursor);
    chain.unshift(album);
    cursor = album.parent_id;
  }
  return chain;
}

/** 相册的完整层级路径（如「Products / dc226」）——父级下拉与重名提示据此区分同名相册。 */
export function albumPath(albums: Album[], albumId: number): string {
  return albumChain(albums, albumId).map((a) => a.name).join(" / ");
}

/** 展开定位用：某相册的全部祖先/自身 id（父级传 null 时为空，即新相册在根层级无需展开）。 */
export function albumChainIds(albums: Album[], albumId: number | null): number[] {
  return albumChain(albums, albumId).map((a) => a.id);
}

/** 某相册的全部子孙 id（**含自身**）：用于禁止把相册挂到自己的子孙下（会成环导致子树从树视图消失）。 */
export function descendantIds(albums: Album[], rootId: number): Set<number> {
  const childrenOf = new Map<number | null, number[]>();
  for (const a of albums) {
    const siblings = childrenOf.get(a.parent_id);
    if (siblings) siblings.push(a.id);
    else childrenOf.set(a.parent_id, [a.id]);
  }
  const result = new Set<number>();
  const stack: number[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current)) continue; // 防御历史脏数据成环导致的死循环
    result.add(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return result;
}

/** 与后端 `_slugify` 同规则：非 [a-zA-Z0-9] 折叠为连字符、去首尾、转小写。 */
export function slugifyAlbumName(text: string): string {
  return text.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

/**
 * 相册树行模板：`AlbumNode` 与媒体页「全部 / 未分类」两个虚拟行必须共用同一套数值。
 * 历史问题：节点行固定占用展开箭头槽（18px），虚拟行没有 → 根级相册的文字比「全部」右移一级，
 * 看起来像「没有父相册却低了一级」。文字左缘 = ALBUM_ROW_PAD + depth * ALBUM_INDENT + 箭头槽 + 图标 + 间距。
 */
export const ALBUM_ROW_PAD = 12;
export const ALBUM_INDENT = 16;
export const ALBUM_ARROW_SLOT = 18;
export const ALBUM_ICON_CLASS = "w-3.5 h-3.5 shrink-0";
export const ALBUM_ROW_GAP_CLASS = "gap-1";

/** 同级重排：把 `fromIndex` 处的项插到 `toIndex` 处（数组下标即新顺序）。拖动与上移/下移共用。 */
export function reorderSiblings<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  const target = Math.max(0, Math.min(toIndex, list.length - 1));
  if (fromIndex === target) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved);
  return next;
}
