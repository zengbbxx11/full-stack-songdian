/*
 * 页面：媒体管理页（/media）
 * 职责：上传和管理图片/文件资源。支持文件上传、列表展示、
 * 复制图片 URL。上传走后端 /api/v1/admin/upload，
 * 记录列表从后端 /api/v1/admin/upload/records 分页获取。
 */
"use client";
import React, { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useToast } from "@/context/ToastContext";
import { apiFetch, swrFetcher, API_BASE } from "@/lib/api-client";
import type { Paginated } from "@/types";

/** 后端上传记录 VO */
interface UploadRecord {
  id: number;
  url: string;
  file_name: string;
  size: number;
  uploaded_by: string | null;
  created_time: string | null;
}

export default function MediaPage() {
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const recordsKey = `/admin/upload/records?page=${page}&page_size=${pageSize}`;
  const { data, isLoading } = useSWR<Paginated<UploadRecord>>(recordsKey, swrFetcher);

  const records = data?.list ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const loading = isLoading && !data;

  // 上传文件
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append("file", file);
        await apiFetch<{ url: string }>("/admin/upload", {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setUploading(false);
    e.target.value = "";
    // 刷新列表
    mutate(recordsKey);
  }

  // 复制 URL
  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied!");
  }

  // 格式化文件大小
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">Media Library</h2>

      {/* 上传区 */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
            Upload Images
          </h3>
          <span className="text-xs text-gray-400">{total} files total</span>
        </div>
        <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
          <div
            className={`w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center ${
              uploading ? "opacity-50" : ""
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Uploading...</span>
              </div>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {uploading ? "Uploading..." : "Click to upload images"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Supports multiple files · JPG, PNG, WebP, GIF
            </p>
          </div>
          <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {/* 图片网格 */}
      {loading ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : records.length > 0 ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90 mb-4">
            {total} uploaded files
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {records.map((rec) => (
              <div key={rec.id} className="group relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* 缩略图 */}
                <div className="aspect-square overflow-hidden">
                  <img
                    src={`${API_BASE}${rec.url}`}
                    alt={rec.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                {/* 信息 + 操作 */}
                <div className="p-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1" title={rec.file_name}>
                    {rec.file_name}
                  </p>
                  <p className="text-[10px] text-gray-400 mb-2">{formatSize(rec.size)}</p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyUrl(`${API_BASE}${rec.url}`)}
                      className="flex-1 text-xs py-1 px-2 rounded bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-400"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">
            No uploaded images yet. Upload one above.
          </p>
        </div>
      )}
    </div>
  );
}
