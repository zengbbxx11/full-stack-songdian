/*
 * 页面：媒体管理页（/media）
 * 职责：上传和管理图片/文件资源。支持拖拽上传（DropZone）、文件列表展示、
 * 复制图片 URL、删除文件。上传走后端 /api/v1/admin/uploads。
 */
"use client";
import React, { useState, useEffect } from "react";
import { useToast } from "@/context/ToastContext";

// 分类定义
const CATEGORIES = [
  { key: "products", label: "Product Images", color: "bg-blue-100 text-blue-700" },
  { key: "news", label: "News Images", color: "bg-purple-100 text-purple-700" },
  { key: "banners", label: "Banners", color: "bg-amber-100 text-amber-700" },
  { key: "exhibitions", label: "Exhibitions", color: "bg-green-100 text-green-700" },
  { key: "other", label: "Other", color: "bg-gray-100 text-gray-600" },
] as const;

interface ImageItem { url: string; name: string; createdAt: string; }

type ImageStore = Record<string, ImageItem[]>;

const STORAGE_KEY = "songdian_media_images";

function loadStore(): ImageStore {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveStore(store: ImageStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

export default function MediaPage() {
  const [activeCat, setActiveCat] = useState("products");
  const [store, setStore] = useState<ImageStore>({});
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  useEffect(() => { setStore(loadStore()); }, []);

  const images = store[activeCat] || [];

  // 单文件上传
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append("file", file);
        const token = getToken();
        const res = await fetch("/api/v1/admin/upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const json = await res.json();
        if (json.code !== "0") throw new Error(json.msg);
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const url = `${base}${json.data.url}`;
        const item: ImageItem = { url, name: file.name, createdAt: new Date().toISOString().slice(0, 10) };
        setStore((prev) => {
          const updated = {
            ...prev,
            [activeCat]: [item, ...(prev[activeCat] || [])],
          };
          saveStore(updated);
          return updated;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setUploading(false);
    // 重置 input
    e.target.value = "";
  }

  // 删除图片
  function handleDelete(index: number) {
    setStore((prev) => {
      const updated = { ...prev };
      updated[activeCat] = [...(prev[activeCat] || [])];
      updated[activeCat].splice(index, 1);
      saveStore(updated);
      return updated;
    });
  }

  // 复制 URL
  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied!");
  }

  // 移动图片到其他分类
  function moveImage(fromCat: string, index: number, toCat: string) {
    setStore((prev) => {
      const updated = { ...prev };
      updated[fromCat] = [...(prev[fromCat] || [])];
      updated[toCat] = [...(prev[toCat] || [])];
      const [moved] = updated[fromCat].splice(index, 1);
      updated[toCat].unshift(moved);
      saveStore(updated);
      return updated;
    });
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">Media Library</h2>

      {/* 分类标签 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCat(cat.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCat === cat.key
                ? `${cat.color} ring-1 ring-offset-1`
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {cat.label}
            <span className="ml-2 opacity-60 text-xs">{(store[cat.key] || []).length}</span>
          </button>
        ))}
      </div>

      {/* 上传区 */}
      <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
            Upload to {CATEGORIES.find((c) => c.key === activeCat)?.label}
          </h3>
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
      {images.length > 0 ? (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90 mb-4">
            {images.length} images in {
              CATEGORIES.find((c) => c.key === activeCat)?.label
            }
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img, i) => (
              <div key={i} className="group relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* 缩略图 */}
                <div className="aspect-square overflow-hidden">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* 信息 + 操作 */}
                <div className="p-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1" title={img.name}>
                    {img.name}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyUrl(img.url)}
                      className="flex-1 text-xs py-1 px-2 rounded bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-400"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleDelete(i)}
                      className="text-xs py-1 px-2 rounded bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                    >
                      Del
                    </button>
                  </div>
                </div>
                {/* 移动分类下拉 */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) moveImage(activeCat, i, e.target.value);
                      e.target.value = "";
                    }}
                    className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5"
                  >
                    <option value="">Move to...</option>
                    {CATEGORIES.filter((c) => c.key !== activeCat).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">
            No images in this category yet. Upload one above.
          </p>
        </div>
      )}
    </div>
  );
}
