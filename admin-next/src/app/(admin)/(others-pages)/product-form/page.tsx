/*
 * 页面：产品编辑/创建表单页（/product-form?id=X）
 * 职责：产品的创建和编辑表单。支持富文本描述（零依赖编辑器）、分类下拉选择、
 * 图片上传/删除、规格属性（SKU/库存等）的增删改。编辑模式下通过 URL query ?id=X
 * 加载既有产品数据，提交走 POST/PUT /api/v1/admin/products。
 */
"use client";
// 后台预览使用运行时上传地址；保留原生 img，避免把任意媒体源交给图片优化代理。
/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import RichTextEditor from "@/components/form/RichTextEditor";
import { apiFetch, API_BASE } from "@/lib/api-client";
import type { ProductCategory, Paginated } from "@/types";

interface GalleryItem { id: number; image_url: string; alt: string | null; sort_order: number; }
interface AttributeItem { id: number; name: string; slug: string; value: string; }

export default function ProductFormPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <ProductFormInner />
    </Suspense>
  );
}

function ProductFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const copyFrom = params.get("copy_from");
  const isEdit = !!id;
  const isCopy = !!copyFrom;

  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [attrs, setAttrs] = useState<AttributeItem[]>([]);
  const [newAttr, setNewAttr] = useState({ name: "", value: "" });
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", sku: "", summary: "", content_html: "", category_id: "", stock_status: "in_stock", status: "DRAFT", cover_image: "", seo_title: "", seo_description: "" });
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
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
    setConfirmOpen(false);
  }

  const loadCats = useCallback(async () => {
    try {
      const d = await apiFetch<Paginated<ProductCategory>>("/admin/categories?page_size=50");
      setCats(d.list || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载分类失败");
    }
  }, [toast]);

  useEffect(() => { loadCats(); }, [loadCats]);

  // 编辑模式加载产品 + 画廊、复制模式预填
  useEffect(() => {
    const sourceId = id || copyFrom;
    if (!sourceId) return;
    apiFetch<Record<string, unknown>>(`/admin/products/${sourceId}`).then((p) => {
      const title = copyFrom ? `Copy of ${String(p.title || "")}` : String(p.title || "");
      const slug = copyFrom ? "" : String(p.slug || "");
      setForm({ title, slug, sku: String(p.sku || ""), summary: String(p.summary || ""), content_html: String(p.content_html || ""), category_id: p.category_id ? String(p.category_id) : "", stock_status: String(p.stock_status || "in_stock"), status: "DRAFT", cover_image: String(p.cover_image || ""), seo_title: String(p.seo_title || ""), seo_description: String(p.seo_description || "") });
      setGalleries((p.galleries as GalleryItem[]) || []);
      setAttrs((p.attributes as AttributeItem[]) || []);
    }).catch((err: unknown) => {
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      toast.error("加载产品失败：" + msg);
    });
  }, [id, copyFrom, toast]);

  // 上传图片文件到后端 → 返回 URL
  async function uploadImage(file: File, productSlug?: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    if (productSlug) formData.append("categorize", `product:${productSlug}`);
    const result = await apiFetch<{ url: string }>("/admin/upload", {
      method: "POST",
      body: formData,
    });
    return `${API_BASE}${result.url}`;
  }

  // 添加画廊图
  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImage(files[i], form.slug);
        const newG = await apiFetch<GalleryItem>(`/admin/products/${id}/gallery`, {
          method: "POST",
          body: { image_url: url.replace(API_BASE, ""), alt: files[i].name, sort_order: galleries.length + i },
        });
        setGalleries(prev => [...prev, { id: newG.id, image_url: newG.image_url, alt: newG.alt, sort_order: newG.sort_order }]);
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    finally { setUploading(false); e.target.value = ""; }
  }

  // 添加规格属性
  async function handleAddAttr() {
    const name = newAttr.name.trim(), value = newAttr.value.trim();
    if (!name || !value || !id) return;
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const res = await apiFetch<AttributeItem>(`/admin/products/${id}/attributes`, {
        method: "POST", body: { name, slug, value },
      });
      setAttrs(prev => [...prev, { id: res.id, name: res.name, slug: res.slug, value: res.value }]);
      setNewAttr({ name: "", value: "" });
    } catch (err) { toast.error(err instanceof Error ? err.message : "添加失败"); }
  }

  // 删除规格属性
  function handleDeleteAttr(attrId: number) {
    if (!id) return;
    openConfirm("删除规格", "确定删除该规格吗？", async () => {
      await apiFetch(`/admin/products/${id}/attributes/${attrId}`, { method: "DELETE" });
      setAttrs(prev => prev.filter(a => a.id !== attrId));
    });
  }
  function handleGalleryDelete(galleryId: number) {
    if (!id) return;
    openConfirm("删除图片", "确定删除该图片吗？", async () => {
      await apiFetch(`/admin/products/${id}/gallery/${galleryId}`, { method: "DELETE" });
      setGalleries(prev => prev.filter(g => g.id !== galleryId));
    });
  }

  // 上传封面图
  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadImage(file, form.slug);
      setForm(prev => ({ ...prev, cover_image: url.replace(API_BASE, "") }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
      if (isEdit) await apiFetch(`/admin/products/${id}`, { method: "PUT", body: payload });
      else await apiFetch("/admin/products", { method: "POST", body: payload });
      router.push("/products");
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存失败"); }
    finally { setSaving(false); }
  }

  function handleDelete() {
    openConfirm("删除产品", "确定要删除该产品吗？", async () => {
      setDeleting(true);
      try {
        await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
        router.push("/products");
      } finally {
        setDeleting(false);
      }
    });
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">
        {isCopy ? "复制产品" : isEdit ? "编辑产品" : "新建产品"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">基本信息</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <Label>标题 * <span className="text-xs text-gray-400 font-normal">（站点显示的产品名称）</span></Label>
              <Input value={form.title} onChange={e => {
                const t = e.target.value;
                setForm(prev => ({ ...prev, title: t, slug: prev.slug || t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
              }} placeholder="e.g. DC105 4K Digital Camera" />
            </div>
            <div>
              <Label>别名 * <span className="text-xs text-gray-400 font-normal">（URL 路径：/products/{form.slug || "slug"}）</span></Label>
              <Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="dc105-4k-digital-camera" />
            </div>
            <div>
              <Label>型号 / SKU <span className="text-xs text-gray-400 font-normal">（工厂型号）</span></Label>
              <Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="DC105" />
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="">无</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Stock</Label>
              <select value={form.stock_status} onChange={e => setForm({...form, stock_status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="in_stock">有货</option><option value="out_of_stock">缺货</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option>
              </select>
            </div>
          </div>
          <div><Label>简介</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>内容（HTML）</Label><RichTextEditor value={form.content_html} onChange={v => setForm({...form, content_html: v})} placeholder="请输入产品描述..." /></div>
        </div>

        {/* SEO 元数据 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">SEO 元数据 <span className="text-xs text-gray-400 font-normal">（选填，留空则自动使用标题和简介）</span></h3>
          <div>
            <Label>SEO 标题 <span className="text-xs text-gray-400 font-normal">（推荐 60 字符以内，留空则用产品标题）</span></Label>
            <div className="relative">
              <Input value={form.seo_title} onChange={e => setForm({...form, seo_title: e.target.value})} placeholder="比产品标题更精炼的 SEO 标题，如：4K Action Camera OEM Manufacturer | Songdian" maxLength={120} />
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${form.seo_title.length > 60 ? "text-amber-500" : "text-gray-400"}`}>{form.seo_title.length}/120</span>
            </div>
          </div>
          <div>
            <Label>SEO 描述 <span className="text-xs text-gray-400 font-normal">（推荐 120-160 字符，留空则用简介截取）</span></Label>
            <div className="relative">
              <textarea
                value={form.seo_description} onChange={e => setForm({...form, seo_description: e.target.value})}
                rows={3} maxLength={300}
                placeholder="吸引用户点击的 meta 描述，含核心关键词和卖点。如：Songdian is a leading OEM digital camera manufacturer offering custom design, competitive pricing, and fast delivery. Contact us for a quote."
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <span className={`absolute right-2 bottom-2 text-xs ${form.seo_description.length > 160 ? "text-amber-500" : "text-gray-400"}`}>{form.seo_description.length}/300</span>
            </div>
          </div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">封面图</h3>
          <div className="flex items-start gap-4">
            {form.cover_image ? (
              <img src={`${API_BASE}${form.cover_image}`} className="w-32 h-32 object-cover rounded-lg border" alt="Cover" />
            ) : (
              <div className="w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">无封面</div>
            )}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/products/x/cover.webp" />
              <label className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                上传图片
                <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 产品画廊（编辑/复制模式） */}
        {(isEdit || isCopy) && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                产品图库（{galleries.length}）
              </h3>
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg cursor-pointer hover:bg-brand-600 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                {uploading ? "上传中..." : "+ 添加图片"}
                <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} className="hidden" disabled={uploading} />
              </label>
            </div>

            {galleries.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No gallery images yet. Click &quot;+ 添加图片&quot; to upload.</p>
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

        {/* 规格（编辑/复制模式） */}
        {(isEdit || isCopy) && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">规格参数</h3>

            {/* 已有规格列表 */}
            {attrs.length > 0 && (
              <div className="space-y-2">
                {attrs.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 w-32 truncate">{a.name}</span>
                    <span className="text-gray-400">=</span>
                    <span className="flex-1 text-gray-600 dark:text-gray-400">{a.value}</span>
                    <button type="button" onClick={() => handleDeleteAttr(a.id)} className="text-red-500 hover:text-red-600 text-xs px-2">删除</button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加新规格 */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <input
                type="text" value={newAttr.name} onChange={e => setNewAttr(prev => ({ ...prev, name: e.target.value }))}
                placeholder="名称（如：传感器）" className="w-40 h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <input
                type="text" value={newAttr.value} onChange={e => setNewAttr(prev => ({ ...prev, value: e.target.value }))}
                placeholder="值（如：4800 万像素 CMOS）" className="flex-1 h-9 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddAttr())}
              />
              <button type="button" onClick={handleAddAttr} className="px-3 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 shrink-0">添加</button>
            </div>
          </div>
        )}

        {/* 操作栏 */}
        <div className="flex justify-between">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除产品"}</Button>}</div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存产品"}</Button>
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
