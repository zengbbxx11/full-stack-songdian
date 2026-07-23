"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // 只在有 body 且非 FormData 时加 Content-Type，避免 GET 请求触发 CORS 预检
  if (opts?.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...opts, headers: { ...headers, ...opts?.headers } });
  const json = await res.json();
  if (json.code !== "0") throw new Error(json.msg || "Failed");
  return json.data;
}

interface Cat { id: number; name: string; }
interface GalleryItem { id: number; image_url: string; alt: string | null; sort_order: number; }
interface AttributeItem { id: number; name: string; slug: string; value: string; }

export default function ProductFormPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const isEdit = !!id;
  const fileRef = useRef<HTMLInputElement>(null);

  const [cats, setCats] = useState<Cat[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [attrs, setAttrs] = useState<AttributeItem[]>([]);
  const [newAttr, setNewAttr] = useState({ name: "", value: "" });
  const [uploading, setUploading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", sku: "", summary: "", content_html: "", category_id: "", stock_status: "in_stock", status: "DRAFT", cover_image: "" });
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState<(() => Promise<void>) | null>(null);

  function openConfirm(title: string, message: string, cb: () => Promise<void>) {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmCallback(() => cb);
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    try {
      if (confirmCallback) await confirmCallback();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
    setConfirmOpen(false);
  }

  const loadCats = useCallback(async () => {
    try { const d = await apiFetch("/api/v1/admin/categories?page_size=50"); setCats(d.list || []); } catch {}
  }, []);

  useEffect(() => { loadCats(); }, [loadCats]);

  // 编辑模式加载产品 + 画廊
  useEffect(() => {
    if (!id) return;
    // 无 token 直接跳登录，不要无谓地调 API
    const token = getToken();
    if (!token) {
      router.push(`/signin?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setLoadingData(true);
    apiFetch(`/api/v1/admin/products/${id}`).then((p: Record<string, unknown>) => {
      setForm({ title: String(p.title || ""), slug: String(p.slug || ""), sku: String(p.sku || ""), summary: String(p.summary || ""), content_html: String(p.content_html || ""), category_id: p.category_id ? String(p.category_id) : "", stock_status: String(p.stock_status || "in_stock"), status: String(p.status || "DRAFT"), cover_image: String(p.cover_image || "") });
      setGalleries((p.galleries as GalleryItem[]) || []);
      setAttrs((p.attributes as AttributeItem[]) || []);
    }).catch((err: unknown) => {
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to load product: " + msg);
    }).finally(() => setLoadingData(false));
  }, [id]);

  // 上传图片文件到后端 → 返回 URL
  async function uploadImage(file: File): Promise<string> {
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
    return `${API_BASE}${json.data.url}`;
  }

  // 添加画廊图
  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImage(files[i]);
        const newG = await apiFetch(`/api/v1/admin/products/${id}/gallery`, {
          method: "POST",
          body: JSON.stringify({ image_url: url.replace(API_BASE, ""), alt: files[i].name, sort_order: galleries.length + i }),
        });
        setGalleries(prev => [...prev, { id: newG.id, image_url: newG.image_url, alt: newG.alt, sort_order: newG.sort_order }]);
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  }

  // 添加规格属性
  async function handleAddAttr() {
    const name = newAttr.name.trim(), value = newAttr.value.trim();
    if (!name || !value || !id) return;
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const res = await apiFetch(`/api/v1/admin/products/${id}/attributes`, {
        method: "POST", body: JSON.stringify({ name, slug, value }),
      });
      setAttrs(prev => [...prev, { id: res.id, name: res.name, slug: res.slug, value: res.value }]);
      setNewAttr({ name: "", value: "" });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to add"); }
  }

  // 删除规格属性
  function handleDeleteAttr(attrId: number) {
    if (!id) return;
    openConfirm("Delete Specification", "Delete this specification?", async () => {
      await apiFetch(`/api/v1/admin/products/${id}/attributes/${attrId}`, { method: "DELETE" });
      setAttrs(prev => prev.filter(a => a.id !== attrId));
    });
  }
  function handleGalleryDelete(galleryId: number) {
    if (!id) return;
    openConfirm("Delete Image", "Delete this image?", async () => {
      await apiFetch(`/api/v1/admin/products/${id}/gallery/${galleryId}`, { method: "DELETE" });
      setGalleries(prev => prev.filter(g => g.id !== galleryId));
    });
  }

  // 上传封面图
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadImage(file);
      setForm(prev => ({ ...prev, cover_image: url.replace(API_BASE, "") }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
      if (isEdit) await apiFetch(`/api/v1/admin/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/api/v1/admin/products", { method: "POST", body: JSON.stringify(payload) });
      router.push("/products");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setSaving(false); }
  }

  function handleDelete() {
    openConfirm("Delete Product", "Are you sure you want to delete this product?", async () => {
      setDeleting(true);
      try {
        await apiFetch(`/api/v1/admin/products/${id}`, { method: "DELETE" });
        router.push("/products");
      } finally {
        setDeleting(false);
      }
    });
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">
        {isEdit ? "Edit Product" : "New Product"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">Basic Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label>Title * <span className="text-xs text-gray-400 font-normal">(Product name shown on site)</span></Label>
              <Input value={form.title} onChange={e => {
                const t = e.target.value;
                setForm(prev => ({ ...prev, title: t, slug: prev.slug || t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
              }} placeholder="e.g. DC105 4K Digital Camera" />
            </div>
            <div>
              <Label>Slug * <span className="text-xs text-gray-400 font-normal">(URL path: /products/{form.slug || "slug"})</span></Label>
              <Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="dc105-4k-digital-camera" />
            </div>
            <div>
              <Label>Model / SKU <span className="text-xs text-gray-400 font-normal">(Factory model number)</span></Label>
              <Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="DC105" />
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="">None</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Stock</Label>
              <select value={form.stock_status} onChange={e => setForm({...form, stock_status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="in_stock">In Stock</option><option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option>
              </select>
            </div>
          </div>
          <div><Label>Summary</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>Content (HTML)</Label><textarea value={form.content_html} onChange={e => setForm({...form, content_html: e.target.value})} rows={8} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">Cover Image</h3>
          <div className="flex items-start gap-4">
            {form.cover_image ? (
              <img src={`${API_BASE}${form.cover_image}`} className="w-32 h-32 object-cover rounded-lg border" alt="Cover" />
            ) : (
              <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">No cover</div>
            )}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/products/x/cover.webp" />
              <label className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                Upload Image
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 产品画廊（仅编辑模式） */}
        {isEdit && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                Product Gallery ({galleries.length})
              </h3>
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg cursor-pointer hover:bg-brand-600 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? "Uploading..." : "+ Add Images"}
                <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} className="hidden" disabled={uploading} />
              </label>
            </div>

            {galleries.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No gallery images yet. Click "+ Add Images" to upload.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {galleries.map(g => (
                  <div key={g.id} className="group relative bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <img src={`${API_BASE}${g.image_url}`} alt={g.alt || ""} className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleGalleryDelete(g.id)}
                        className="opacity-0 group-hover:opacity-100 px-3 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-opacity"
                      >
                        Delete
                      </button>
                    </div>
                    {g.alt && <p className="p-1.5 text-xs text-gray-500 truncate">{g.alt}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 规格（仅编辑模式） */}
        {isEdit && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">Specifications</h3>

            {/* 已有规格列表 */}
            {attrs.length > 0 && (
              <div className="space-y-2">
                {attrs.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-32 truncate">{a.name}</span>
                    <span className="text-gray-400">=</span>
                    <span className="flex-1 text-gray-600 dark:text-gray-400">{a.value}</span>
                    <button type="button" onClick={() => handleDeleteAttr(a.id)} className="text-red-500 hover:text-red-600 text-xs px-2">Delete</button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加新规格 */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <input
                type="text" value={newAttr.name} onChange={e => setNewAttr(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Name (e.g. Sensor)" className="w-40 h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <input
                type="text" value={newAttr.value} onChange={e => setNewAttr(prev => ({ ...prev, value: e.target.value }))}
                placeholder="Value (e.g. 48MP CMOS)" className="flex-1 h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddAttr())}
              />
              <button type="button" onClick={handleAddAttr} className="px-3 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 shrink-0">Add</button>
            </div>
          </div>
        )}

        {/* 操作栏 */}
        <div className="flex justify-between">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete Product"}</Button>}</div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Product"}</Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
