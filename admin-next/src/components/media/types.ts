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
