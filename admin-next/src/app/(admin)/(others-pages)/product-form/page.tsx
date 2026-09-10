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
import { apiFetch, apiFetchAllPages, resolveMediaUrl } from "@/lib/api-client";
import type { ProductCategory } from "@/types";
import { publicationTime, toLocalDateTime } from "@/lib/content-time";
import { useSWRConfig } from "swr";
import ContentWorkflowPanel from "@/components/content/ContentWorkflowPanel";

interface GalleryItem { id: number; image_url: string; alt: string | null; sort_order: number; }
interface AttributeItem { id: number; name: string; slug: string; value: string; }

export default function ProductFormPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <ProductFormRoute />
    </Suspense>
  );
}

function ProductFormRoute() {
  const params = useSearchParams();
  return <ProductFormInner key={`${params.get("id") || "new"}:${params.get("copy_from") || ""}`} />;
}

function ProductFormInner() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
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
  const [form, setForm] = useState({ title: "", slug: "", sku: "", summary: "", content_html: "", category_id: "", stock_status: "instock", status: "DRAFT", published_at: "", cover_image: "", seo_title: "", seo_description: "" });
  const { error: showError } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState<(() => Promise<void>) | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

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
      showError(err instanceof Error ? err.message : "删除失败");
    }
    setConfirmOpen(false);
  }

  const loadCats = useCallback(async () => {
    try {
      const d = await apiFetchAllPages<ProductCategory>("/admin/categories");
      setCats(d.list || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : "加载分类失败");
    }
  }, [showError]);

  useEffect(() => { loadCats(); }, [loadCats]);

  // 编辑模式加载产品 + 画廊、复制模式预填
  useEffect(() => {
    const sourceId = id || copyFrom;
    if (!sourceId) return;
    let active = true;
    apiFetch<Record<string, unknown>>(`/admin/products/${sourceId}`).then((p) => {
      if (!active) return;
      setLoadError("");
      setLoadedKey((id || copyFrom) + ":" + reloadKey);
      const title = copyFrom ? `Copy of ${String(p.title || "")}` : String(p.title || "");
      const slug = copyFrom ? "" : String(p.slug || "");
      const category = p.category as { id?: number } | undefined;
      setForm({ title, slug, sku: String(p.sku || ""), summary: String(p.summary || ""), content_html: String(p.content_html || ""), category_id: category?.id ? String(category.id) : "", stock_status: String(p.stock_status || "instock"), status: copyFrom ? "DRAFT" : String(p.status || "DRAFT"), published_at: copyFrom ? "" : toLocalDateTime(String(p.published_at || "")), cover_image: String(p.cover_image || ""), seo_title: String(p.seo_title || ""), seo_description: String(p.seo_description || "") });
      setGalleries((p.galleries as GalleryItem[]) || []);
      setAttrs((p.attributes as AttributeItem[]) || []);
    }).catch((err: unknown) => {
      if (!active) return;
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      setLoadError(msg);
      showError("加载产品失败：" + msg);
    });
    return () => { active = false; };
  }, [id, copyFrom, showError, reloadKey]);

  // 上传图片文件到后端 → 返回 URL
  async function uploadImage(file: File, productSlug?: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    if (productSlug) formData.append("categorize", `product:${productSlug}`);
    const result = await apiFetch<{ url: string }>("/admin/upload", {
      method: "POST",
      body: formData,
    });
    return result.url;
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
          body: { image_url: url, alt: files[i].name, sort_order: galleries.length + i },
        });
        setGalleries(prev => [...prev, { id: newG.id, image_url: newG.image_url, alt: newG.alt, sort_order: newG.sort_order }]);
      }
    } catch (err) { showError(err instanceof Error ? err.message : "上传失败"); }
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
    } catch (err) { showError(err instanceof Error ? err.message : "添加失败"); }
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
      setForm(prev => ({ ...prev, cover_image: url }));
    } catch (err) { showError(err instanceof Error ? err.message : "上传失败"); }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || ((id || copyFrom) && loadedKey !== (id || copyFrom) + ":" + reloadKey)) return;
    setSaving(true);
    try {
      if (!form.title.trim() || !form.slug.trim() || !form.category_id) throw new Error("请填写标题、别名并选择分类");
      const payload: Record<string, unknown> = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
      payload.published_at = publicationTime(form.published_at, form.status);
      if (!payload.published_at) delete payload.published_at;
      if (isEdit) await apiFetch(`/admin/products/${id}`, { method: "PUT", body: payload });
      else await apiFetch("/admin/products", { method: "POST", body: payload });
      await mutate(key => typeof key === "string" && (key.startsWith("/admin/products?") || key === "/admin/products" || key === "/admin/stats"), undefined, { revalidate: true });
      router.push("/products");
    } catch (err) { showError(err instanceof Error ? err.message : "保存失败"); }
    finally { setSaving(false); }
  }

  function handleDelete() {
    openConfirm("删除产品", "确定要删除该产品吗？", async () => {
      setDeleting(true);
      try {
        await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
        await mutate(key => typeof key === "string" && (key.startsWith("/admin/products?") || key === "/admin/products" || key === "/admin/stats"), undefined, { revalidate: true });
      router.push("/products");
      } finally {
        setDeleting(false);
      }
    });
  }

  if ((id || copyFrom) && loadedKey !== (id || copyFrom) + ":" + reloadKey) return <div className="p-6" role={loadError ? "alert" : "status"}>
    <p>{loadError ? "内容加载失败：" + loadError : "正在加载内容..."}</p>
    {loadError && <button type="button" className="mt-3 underline" onClick={() => { setLoadError(""); setReloadKey(value => value + 1); }}>重新加载</button>}
  </div>;

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">
        {isCopy ? "复制产品" : isEdit ? "编辑产品" : "新建产品"}
      </h2>

      {isCopy && <p className="mb-4 text-sm text-amber-700">复制基本信息、封面及 SEO；图库和规格不会自动复制，请保存后进入编辑页添加。</p>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-sm text-gray-500">草稿和定时内容可在后台编辑，并通过“打开预览”查看；只有已发布内容在官网公开。发布时间按当前设备时区填写。</p>
        <fieldset disabled={saving || deleting} className="space-y-6">
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
              <Label htmlFor="product-category">分类 *</Label>
              <select id="product-category" required value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="">请选择分类</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Stock</Label>
              <select value={form.stock_status} onChange={e => setForm({...form, stock_status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="instock">有货</option><option value="outofstock">缺货</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select aria-label="内容状态" value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90">
                <option value="DRAFT">草稿</option><option value="SCHEDULED">定时发布</option><option value="PUBLISHED">已发布</option>
              </select>
            </div>
            <div>
              <Label htmlFor="publication-time">发布时间</Label>
              <Input id="publication-time" type="datetime-local" step={1} value={form.published_at} onChange={e => setForm({...form, published_at: e.target.value})} />
            </div>
          </div>
          <div><Label>简介</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>内容（HTML）</Label><RichTextEditor value={form.content_html} onChange={v => setForm({...form, content_html: v})} placeholder="请输入产品描述..." /></div>
        </div>

        {/* SEO 元数据 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">SEO 元数据 <span className="text-xs text-gray-400 font-normal">（选填，用于官网页面及分享元数据）</span></h3>
          <p className="text-xs text-gray-500">保存后更新官网元数据，不改变正文中的产品名称。页面标题会自动追加品牌名；草稿仍需通过预览查看。</p>
          <div>
            <Label htmlFor="product-seo-title">SEO 标题 <span className="text-xs text-gray-400 font-normal">（推荐 60 字符以内，留空则用产品标题）</span></Label>
            <div className="relative">
              <Input id="product-seo-title" value={form.seo_title} onChange={e => setForm({...form, seo_title: e.target.value})} placeholder="填写准确的产品页面标题，无需追加品牌名" maxLength={120} />
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${form.seo_title.length > 60 ? "text-amber-500" : "text-gray-400"}`}>{form.seo_title.length}/120</span>
            </div>
          </div>
          <div>
            <Label htmlFor="product-seo-description">SEO 描述 <span className="text-xs text-gray-400 font-normal">（参考长度 120-160 字符）</span></Label>
            <div className="relative">
              <textarea
                id="product-seo-description" value={form.seo_description} onChange={e => setForm({...form, seo_description: e.target.value})}
                rows={3} maxLength={300}
                placeholder="准确概括本产品；留空时使用产品名、公司介绍和简介生成默认描述"
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <span className={`absolute right-2 bottom-2 text-xs ${form.seo_description.length > 160 ? "text-amber-500" : "text-gray-400"}`}>{form.seo_description.length}/300</span>
            </div>
          </div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">封面图</h3>
            <p className={`mt-1 text-xs ${form.slug.trim() ? "text-gray-400" : "text-amber-600 dark:text-amber-400"}`}>
              {form.slug.trim()
                ? <>上传后归档至：媒体库 / Products / <span className="font-medium">{form.slug.trim()}</span></>
                : "请先填写别名；现在上传的图片将进入媒体库的“未分类”。"}
            </p>
          </div>
          <div className="flex items-start gap-4">
            {form.cover_image ? (
              <img src={resolveMediaUrl(form.cover_image)} className="w-32 h-32 object-cover rounded-lg border" alt="Cover" />
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

        {isEdit && <p className="text-sm text-gray-500">图库与规格的添加、删除会立即保存；取消编辑不会撤销这些操作。</p>}
        {/* 产品画廊 */}
        {isEdit && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                  产品图库（{galleries.length}）
                </h3>
                <p className={`mt-1 text-xs ${form.slug.trim() ? "text-gray-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {form.slug.trim()
                    ? <>新增图片归档至：媒体库 / Products / <span className="font-medium">{form.slug.trim()}</span></>
                    : "请先填写别名，以便新增图片自动归档。"}
                </p>
              </div>
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
                    <img src={resolveMediaUrl(g.image_url)} alt={g.alt || ""} className="w-full aspect-square object-cover" />
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
        {isEdit && (
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

        {isEdit && id && <ContentWorkflowPanel resource="products" id={id} onRestored={() => setReloadKey((value) => value + 1)} />}

        {/* 操作栏 */}
        <div className="flex justify-between">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除产品"}</Button>}</div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存产品"}</Button>
          </div>
        </div>
        </fieldset>
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
