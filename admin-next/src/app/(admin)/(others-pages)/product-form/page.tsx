/*
 * 页面：产品编辑/创建表单页（/product-form?id=X）
 * 职责：产品的创建和编辑表单。支持商品详情图、分类下拉选择、
 * 图片上传/删除、规格属性（SKU/库存等）的增删改。编辑模式下通过 URL query ?id=X
 * 加载既有产品数据，提交走 POST/PUT /api/v1/admin/products。
 */
"use client";
// 后台预览使用运行时上传地址；保留原生 img，避免把任意媒体源交给图片优化代理。
/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DateTimeField from "@/components/form/DateTimeField";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import SelectField from "@/components/form/SelectField";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import MediaPicker from "@/components/media/MediaPicker";
import type { PickedMedia } from "@/components/media/types";
import ProductDetailImageEditor from "@/components/form/ProductDetailImageEditor";
import { apiFetch, apiFetchAllPages, resolveMediaUrl } from "@/lib/api-client";
import type { ProductCategory } from "@/types";
import { publicationTime, toLocalDateTime } from "@/lib/content-time";
import { useSWRConfig } from "swr";
import ContentWorkflowPanel from "@/components/content/ContentWorkflowPanel";

interface GalleryItem { id: number; image_url: string; alt: string | null; sort_order: number; }
interface AttributeItem { id: number; name: string; slug: string; value: string; }
/** 关联产品（后台手选、单向、最多 RELATED_MAX 个）：数组顺序即前台展示顺序。 */
interface RelatedItem { id: number; title: string; slug: string; status: string; cover_image: string | null; }

/** 与后端 services.MAX_RELATED_PRODUCTS 对齐：超过会被 400 拒绝。 */
const RELATED_MAX = 4;

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
  // 关联产品：related = 已选（按展示顺序，提交时取 id 数组）；relatedKeyword/options = 选品搜索
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [relatedKeyword, setRelatedKeyword] = useState("");
  const [relatedOptions, setRelatedOptions] = useState<RelatedItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 素材选择器（替代表单内直接上传）：上传中仍通过 coverUploading/uploading 禁用保存。
  const [coverUploading, setCoverUploading] = useState(false);
  const [detailUploading, setDetailUploading] = useState(false);
  // 详情图自上次保存后被改动：用于离开页面前的提醒（保存成功后复位）。
  const [detailDirty, setDetailDirty] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  // 选择器开关；详情图选择器以 Promise 形式接入编辑器（确认时 resolve，取消时 resolve 空数组）
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [detailPickerOpen, setDetailPickerOpen] = useState(false);
  const detailPickResolve = useRef<((picked: PickedMedia[]) => void) | null>(null);
  const [form, setForm] = useState({ title: "", slug: "", sku: "", summary: "", content_html: "", category_id: "", stock_status: "instock", status: "DRAFT", published_at: "", cover_image: "", seo_title: "", seo_description: "" });
  const { error: showError } = useToast();

  // 详情图有未保存改动时，刷新/关闭页面前由浏览器给出原生确认（SPA 内部的“取消”另走下面的对话框）。
  useEffect(() => {
    if (!detailDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [detailDirty]);
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
      // 关联产品回填（复制模式下同样带过来，便于以现有产品为模板）
      setRelated((p.related as RelatedItem[]) || []);
    }).catch((err: unknown) => {
      if (!active) return;
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      setLoadError(msg);
      showError("加载产品失败：" + msg);
    });
    return () => { active = false; };
  }, [id, copyFrom, showError, reloadKey]);

  // 关联产品候选：按关键字搜索（后端 /admin/products 支持 keyword + 分页，单页上限 50）
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setRelatedLoading(true);
      const query = relatedKeyword ? `&keyword=${encodeURIComponent(relatedKeyword)}` : "";
      apiFetch<{ list: RelatedItem[] }>(`/admin/products?page_size=20${query}`)
        .then((data) => { if (active) setRelatedOptions(data.list || []); })
        .catch((err: unknown) => {
          if (active) showError(err instanceof Error ? err.message : "加载候选产品失败");
        })
        .finally(() => { if (active) setRelatedLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [relatedKeyword, showError]);

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

  // 从媒体库选图加入图库（保留「添加即保存」语义：逐张 POST，失败逐条提示）。
  // 同一张图重复加入会产生重复图库行，先按 URL 去重。
  async function addGalleryImages(picked: PickedMedia[]) {
    if (!id || picked.length === 0) return;
    const existing = new Set(galleries.map(g => g.image_url));
    const fresh = picked.filter(p => !existing.has(p.url));
    if (fresh.length === 0) { showError("所选图片都已在图库中"); return; }
    setUploading(true);
    try {
      for (let i = 0; i < fresh.length; i++) {
        const newG = await apiFetch<GalleryItem>(`/admin/products/${id}/gallery`, {
          method: "POST",
          body: { image_url: fresh[i].url, alt: fresh[i].title || "", sort_order: galleries.length + i },
        });
        setGalleries(prev => [...prev, { id: newG.id, image_url: newG.image_url, alt: newG.alt, sort_order: newG.sort_order }]);
      }
    } catch (err) { showError(err instanceof Error ? err.message : "添加失败"); }
    finally { setUploading(false); }
  }

  // 详情图选择器：以 Promise 接入编辑器（确认 resolve 选中项，取消 resolve 空数组）
  function openDetailPicker(): Promise<PickedMedia[]> {
    return new Promise((resolve) => { detailPickResolve.current = resolve; setDetailPickerOpen(true); });
  }
  function closeDetailPicker(picked?: PickedMedia[]) {
    detailPickResolve.current?.(picked ?? []);
    detailPickResolve.current = null;
    setDetailPickerOpen(false);
  }

  // 添加规格属性
  async function handleAddAttr() {
    const name = newAttr.name.trim(), value = newAttr.value.trim();
    if (!name || !value || !id) return;
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

  // ── 关联产品（最多 RELATED_MAX 个，单向）：选择顺序即前台展示顺序 ──
  function addRelated(item: RelatedItem) {
    if (related.length >= RELATED_MAX) return;
    if (related.some(r => r.id === item.id)) return;
    if (id && Number(id) === item.id) return;  // 后端也会拒绝自关联，这里先挡住
    setRelated(prev => [...prev, item]);
  }
  function removeRelated(itemId: number) {
    setRelated(prev => prev.filter(r => r.id !== itemId));
  }
  function moveRelated(index: number, delta: number) {
    setRelated(prev => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || detailUploading || coverUploading || ((id || copyFrom) && loadedKey !== (id || copyFrom) + ":" + reloadKey)) return;
    setSaving(true);
    try {
      if (!form.title.trim() || !form.slug.trim() || !form.category_id) throw new Error("请填写标题、别名并选择分类");
      const payload: Record<string, unknown> = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
      // 关联产品随主表单一起提交；数组顺序 = 前台 Related Products 的展示顺序（空数组表示清空）
      payload.related_product_ids = related.map(r => r.id);
      payload.published_at = publicationTime(form.published_at, form.status);
      if (!payload.published_at) delete payload.published_at;
      if (isEdit) await apiFetch(`/admin/products/${id}`, { method: "PUT", body: payload });
      else await apiFetch("/admin/products", { method: "POST", body: payload });
      await mutate(key => typeof key === "string" && (key.startsWith("/admin/products?") || key === "/admin/products" || key === "/admin/stats"), undefined, { revalidate: true });
      setDetailDirty(false);
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
        {/* fieldset 默认 min-width:min-content，窄屏上会被内部固定宽内容顶出横向溢出，故补 min-w-0 */}
        <fieldset disabled={saving || deleting || detailUploading || coverUploading} className="min-w-0 space-y-6">
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
              <SelectField id="product-category" required value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
                <option value="">请选择分类</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            </div>
            <div>
              <Label>Stock</Label>
              <SelectField value={form.stock_status} onChange={e => setForm({...form, stock_status: e.target.value})}>
                <option value="instock">有货</option><option value="outofstock">缺货</option>
              </SelectField>
            </div>
            <div>
              <Label>Status</Label>
              <SelectField aria-label="内容状态" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="DRAFT">草稿</option><option value="SCHEDULED">定时发布</option><option value="PUBLISHED">已发布</option>
              </SelectField>
            </div>
            <div>
              <Label htmlFor="publication-time">发布时间</Label>
              <DateTimeField id="publication-time" value={form.published_at} onChange={e => setForm({...form, published_at: e.target.value})} />
            </div>
          </div>
          <div><Label>简介</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>商品详情图</Label><ProductDetailImageEditor value={form.content_html} name={form.title} onChange={value => setForm(prev => ({ ...prev, content_html: value }))} onBusyChange={setDetailUploading} onDirtyChange={setDetailDirty} upload={file => uploadImage(file, form.slug)} pickFromLibrary={openDetailPicker} /></div>
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
                ? <>图片归属：媒体库 / Products / <span className="font-medium">{form.slug.trim()}</span>；选择器内也可直接上传。</>
                : "请先填写别名；选择器内上传的图片将进入媒体库的“未分类”。"}
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {form.cover_image ? (
              <img src={resolveMediaUrl(form.cover_image)} className="w-32 h-32 shrink-0 object-cover rounded-lg border" alt="Cover" />
            ) : (
              <div className="w-32 h-32 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">无封面</div>
            )}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/products/x/cover.webp" />
              <button
                type="button"
                onClick={() => setCoverPickerOpen(true)}
                disabled={coverUploading}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {coverUploading ? "处理中..." : "从媒体库选择封面"}
              </button>
            </div>
          </div>
        </div>

        {isEdit && <p className="text-sm text-gray-500">图库与规格的添加、删除会立即保存；取消编辑不会撤销这些操作。</p>}
        {/* 产品画廊 */}
        {isEdit && (
          <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                  产品图库（{galleries.length}）
                </h3>
                <p className={`mt-1 text-xs ${form.slug.trim() ? "text-gray-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {form.slug.trim()
                    ? <>图片归属：媒体库 / Products / <span className="font-medium">{form.slug.trim()}</span>；选择器内也可直接上传。</>
                    : "请先填写别名，以便选择器内上传的图片自动归档。"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGalleryPickerOpen(true)}
                disabled={uploading}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "添加中..." : "+ 从媒体库添加"}
              </button>
            </div>

            {galleries.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">暂无图库图片，点上方「从媒体库添加」。</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {galleries.map(g => (
                  <div key={g.id} className="group relative bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <img src={resolveMediaUrl(g.image_url)} alt={g.alt || ""} className="w-full aspect-square object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleGalleryDelete(g.id)}
                        // 触摸端没有 hover，移动端常显；≥768px 仍为悬停出现
                        className="min-h-9 px-3 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100"
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
                  <div key={a.id} className="flex flex-wrap items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm sm:gap-3">
                    <span className="w-20 shrink-0 truncate font-medium text-gray-700 dark:text-gray-300 sm:w-32">{a.name}</span>
                    <span className="text-gray-400">=</span>
                    <span className="min-w-0 flex-1 break-words text-gray-600 dark:text-gray-400">{a.value}</span>
                    <button type="button" onClick={() => handleDeleteAttr(a.id)} className="min-h-9 shrink-0 px-2 text-xs text-red-500 hover:text-red-600 sm:min-h-0">删除</button>
                  </div>
                ))}
              </div>
            )}

            {/* 添加新规格 */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 sm:gap-3 dark:border-gray-700">
              <input
                type="text" value={newAttr.name} onChange={e => setNewAttr(prev => ({ ...prev, name: e.target.value }))}
                placeholder="名称（如：传感器）" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm sm:h-9 sm:w-40 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <input
                type="text" value={newAttr.value} onChange={e => setNewAttr(prev => ({ ...prev, value: e.target.value }))}
                placeholder="值（如：4800 万像素 CMOS）" className="h-10 w-full min-w-0 rounded-lg border border-gray-300 bg-transparent px-3 text-sm sm:h-9 sm:flex-1 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddAttr())}
              />
              <button type="button" onClick={handleAddAttr} className="min-h-10 shrink-0 px-3 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 sm:min-h-0 sm:py-1.5">添加</button>
            </div>
          </div>
        )}

        {/* 关联产品（最多 4 个，单向）：随主表单一起提交 related_product_ids */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
              关联产品（{related.length}/{RELATED_MAX}）
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              手动选择本产品详情页「Related Products」要展示的产品（单向：只影响本产品页）；一个都不选则前台不显示该区块。
            </p>
          </div>

          {/* 已选：按展示顺序排列，可上移/下移/移除 */}
          {related.length > 0 ? (
            <div className="space-y-2">
              {related.map((item, index) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm sm:gap-3">
                  {item.cover_image
                    ? <img src={resolveMediaUrl(item.cover_image)} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />}
                  <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-300">{item.title}</span>
                  <span className="hidden min-w-0 truncate text-xs text-gray-400 sm:inline">/{item.slug}</span>
                  {item.status !== "PUBLISHED" && (
                    <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">未发布，前台不显示</span>
                  )}
                  <span className="hidden flex-1 sm:block" />
                  <button type="button" onClick={() => moveRelated(index, -1)} disabled={index === 0}
                    className="min-h-9 px-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 sm:min-h-0">上移</button>
                  <button type="button" onClick={() => moveRelated(index, 1)} disabled={index === related.length - 1}
                    className="min-h-9 px-2 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 sm:min-h-0">下移</button>
                  <button type="button" onClick={() => removeRelated(item.id)}
                    className="min-h-9 px-2 text-xs text-red-500 hover:text-red-600 sm:min-h-0">移除</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">尚未选择关联产品，前台不显示 Related Products 区块。</p>
          )}

          {/* 搜索候选并添加 */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 sm:gap-3 dark:border-gray-700">
            <input
              type="text" value={relatedKeyword} onChange={e => setRelatedKeyword(e.target.value)}
              placeholder="搜索产品名称…" aria-label="搜索要关联的产品"
              className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 text-sm sm:h-9 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <span className="shrink-0 text-xs text-gray-400">{relatedLoading ? "加载中…" : `候选 ${relatedOptions.length} 个`}</span>
          </div>
          {related.length >= RELATED_MAX && (
            <p className="text-xs text-amber-600 dark:text-amber-400">已达上限 {RELATED_MAX} 个，如需更换请先移除一个。</p>
          )}
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {relatedOptions
              .filter(o => !related.some(r => r.id === o.id) && !(id && Number(id) === o.id))
              .map(o => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm sm:gap-3">
                  {o.cover_image
                    ? <img src={resolveMediaUrl(o.cover_image)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    : <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />}
                  <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">{o.title}</span>
                  {o.status !== "PUBLISHED" && (
                    <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">未发布</span>
                  )}
                  <span className="hidden flex-1 sm:block" />
                  <button type="button" onClick={() => addRelated(o)} disabled={related.length >= RELATED_MAX}
                    className="min-h-9 shrink-0 px-3 py-1 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-40 sm:min-h-0">添加</button>
                </div>
              ))}
          </div>
        </div>

        {isEdit && id && <ContentWorkflowPanel resource="products" id={id} onRestored={() => setReloadKey((value) => value + 1)} />}

        {/* 操作栏：移动端吸底常驻（长表单不必滚到底才能保存），≥640px 恢复原行内布局 */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 dark:border-gray-800 dark:bg-gray-900/95 sm:dark:bg-transparent">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除产品"}</Button>}</div>
          <div className="flex flex-1 justify-end gap-3 sm:flex-none">
            <Button variant="outline" type="button" onClick={() => { if (detailDirty) setLeaveConfirm(true); else router.back(); }}>取消</Button>
            <Button type="submit" disabled={saving || detailUploading || coverUploading}>{saving ? "保存中..." : detailUploading ? "详情图上传中..." : coverUploading ? "封面上传中..." : "保存产品"}</Button>
          </div>
        </div>
        </fieldset>
      </form>

      {/* 媒体选择器：封面（单选）/ 图库（多选）/ 详情图（多选，Promise 接入编辑器）。
          上传归属默认 product:{slug}（后端自动建/复用 Products/{slug} 相册），保证素材必有归属。 */}
      {coverPickerOpen && (
        <MediaPicker
          mode="single"
          categorizeHint={form.slug.trim() ? `product:${form.slug.trim()}` : undefined}
          onBusyChange={setCoverUploading}
          onClose={() => setCoverPickerOpen(false)}
          onConfirm={(picked) => {
            const first = picked[0];
            if (first) setForm(prev => ({ ...prev, cover_image: first.url }));
            setCoverPickerOpen(false);
          }}
        />
      )}
      {galleryPickerOpen && (
        <MediaPicker
          mode="multiple"
          categorizeHint={form.slug.trim() ? `product:${form.slug.trim()}` : undefined}
          onBusyChange={setUploading}
          onClose={() => setGalleryPickerOpen(false)}
          onConfirm={(picked) => { void addGalleryImages(picked); setGalleryPickerOpen(false); }}
        />
      )}
      {detailPickerOpen && (
        <MediaPicker
          mode="multiple"
          categorizeHint={form.slug.trim() ? `product:${form.slug.trim()}` : undefined}
          onBusyChange={setDetailUploading}
          onClose={() => closeDetailPicker()}
          onConfirm={(picked) => closeDetailPicker(picked)}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* 详情图改动未保存时离开，先确认 */}
      <ConfirmDialog
        open={leaveConfirm}
        title="放弃未保存的详情图改动？"
        message="详情图改动还没保存，离开后会丢失。"
        confirmText="离开"
        onConfirm={() => { setLeaveConfirm(false); setDetailDirty(false); router.back(); }}
        onCancel={() => setLeaveConfirm(false)}
      />
    </div>
  );
}
