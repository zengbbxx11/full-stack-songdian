/*
 * 页面：新闻编辑/创建表单页（/news-form?id=X）
 * 职责：新闻的创建和编辑表单。支持标题/内容（富文本编辑器）、分类下拉选择、
 * 封面图上传。编辑模式下通过 URL query ?id=X 加载既有新闻数据，
 * 提交走 POST/PUT /api/v1/admin/news。
 */
"use client";
// 后台预览使用运行时上传地址；保留原生 img，避免把任意媒体源交给图片优化代理。
/* eslint-disable @next/next/no-img-element */
import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DateTimeField from "@/components/form/DateTimeField";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import SelectField from "@/components/form/SelectField";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import RichTextEditor from "@/components/form/RichTextEditor";
import MediaPicker from "@/components/media/MediaPicker";
import type { PickedMedia } from "@/components/media/types";
import { useToast } from "@/context/ToastContext";
import { apiFetch, apiFetchAllPages, resolveMediaUrl } from "@/lib/api-client";
import type { NewsCategory, NewsItem } from "@/types";
import { publicationTime, toLocalDateTime } from "@/lib/content-time";
import { useSWRConfig } from "swr";
import ContentWorkflowPanel from "@/components/content/ContentWorkflowPanel";

export default function NewsFormPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
      <NewsFormRoute />
    </Suspense>
  );
}

function NewsFormRoute() {
  const params = useSearchParams();
  return <NewsFormInner key={params.get("id") || "new"} />;
}

function NewsFormInner() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const params = useSearchParams();
  const id = params.get("id");
  const isEdit = !!id;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 封面/正文素材选择器（替代表单内直接上传）：上传中仍通过 coverUploading/contentUploading 禁用保存。
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [richPickerOpen, setRichPickerOpen] = useState(false);
  const richPickResolve = useRef<((picked: PickedMedia[]) => void) | null>(null);
  // 正文「插入图片」上传期间禁用保存，避免提交半成品正文。
  const [contentUploading, setContentUploading] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", summary: "", content_html: "", author: "", status: "DRAFT", cover_image: "", published_at: "", category_id: "" });
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [categoryError, setCategoryError] = useState("");
  const { error: showError, success: showSuccess } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    let active = true;
    apiFetchAllPages<NewsCategory>("/admin/news-categories").then(data => {
      if (active) { setCategories(data.list); setCategoryError(""); }
    }).catch(() => { if (active) setCategoryError("分类加载失败，请重新加载页面后重试"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    apiFetch<NewsItem>(`/admin/news/${id}`).then((p) => {
      if (!active) return;
      setLoadError("");
      setLoadedKey(id + ":" + reloadKey);
      setForm({ title: p.title || "", slug: p.slug || "", summary: p.summary || "", content_html: p.content_html || "", author: p.author || "", status: p.status || "DRAFT", cover_image: p.cover_image || "", published_at: toLocalDateTime(p.published_at), category_id: p.category ? String(p.category.id) : "" });
    }).catch((err: unknown) => {
      if (!active) return;
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      setLoadError(msg);
      showError("加载文章失败：" + msg);
    });
    return () => { active = false; };
  }, [id, showError, reloadKey]);

  // 封面选择器：确认后写入 cover_image（选择器内上传会自动归档到 News / {slug}）
  function closeCoverPicker(picked?: PickedMedia[]) {
    const first = picked?.[0];
    if (first) setForm(prev => ({ ...prev, cover_image: first.url }));
    setCoverPickerOpen(false);
  }

  // 正文选择器：以 Promise 接入富文本编辑器（确认 resolve 选中项，取消 resolve 空数组）
  function openRichPicker(): Promise<PickedMedia[]> {
    return new Promise((resolve) => { richPickResolve.current = resolve; setRichPickerOpen(true); });
  }
  function closeRichPicker(picked?: PickedMedia[]) {
    richPickResolve.current?.(picked ?? []);
    richPickResolve.current = null;
    setRichPickerOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || coverUploading || (id && loadedKey !== id + ":" + reloadKey)) return;
    setSaving(true);
    try {
      // 如果未填写发布时间则从请求体中移除，避免空字符串导致后端 Pydantic 校验失败
      if (!form.title.trim() || !form.slug.trim() || !form.category_id) throw new Error("请填写标题、别名并选择分类");
      const payload: Record<string, unknown> = { ...form, category_id: Number(form.category_id) };
      payload.published_at = publicationTime(form.published_at, form.status);
      if (!payload.published_at) delete payload.published_at;
      if (isEdit) await apiFetch(`/admin/news/${id}`, { method: "PUT", body: payload });
      else await apiFetch("/admin/news", { method: "POST", body: payload });
      await mutate(key => typeof key === "string" && (key.startsWith("/admin/news?") || key === "/admin/news" || key === "/admin/stats"), undefined, { revalidate: true });
      router.push("/news");
    } catch (err) { showError(err instanceof Error ? err.message : "保存失败"); } finally { setSaving(false); }
  }

  function handleDelete() {
    setDeleteConfirm(true);
  }

  async function handleConfirmDelete() {
    setDeleteConfirm(false);
    setDeleting(true);
    try { await apiFetch(`/admin/news/${id}`, { method: "DELETE" }); showSuccess("文章已删除"); await mutate(key => typeof key === "string" && (key.startsWith("/admin/news?") || key === "/admin/news" || key === "/admin/stats"), undefined, { revalidate: true });
      router.push("/news"); }
    catch (err) { showError(err instanceof Error ? err.message : "删除失败"); setDeleting(false); }
  }

  if (id && loadedKey !== id + ":" + reloadKey) return <div className="p-6" role={loadError ? "alert" : "status"}>
    <p>{loadError ? "内容加载失败：" + loadError : "正在加载内容..."}</p>
    {loadError && <button type="button" className="mt-3 underline" onClick={() => { setLoadError(""); setReloadKey(value => value + 1); }}>重新加载</button>}
  </div>;

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">{isEdit ? "编辑新闻" : "新建文章"}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-sm text-gray-500">草稿和定时内容可在后台编辑，并通过“打开预览”查看；只有已发布内容在官网公开。发布时间按当前设备时区填写。</p>
        {/* fieldset 默认 min-width:min-content，窄屏上会被内部固定宽内容顶出横向溢出，故补 min-w-0 */}
        <fieldset disabled={saving || deleting || coverUploading || contentUploading} className="min-w-0 space-y-6">
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">文章信息</h3>
          {categoryError && <p role="alert" className="text-red-600">{categoryError}</p>}
          <div><Label htmlFor="news-category">分类 *</Label>
            <SelectField id="news-category" required value={form.category_id} onChange={e => setForm(prev => ({ ...prev, category_id: e.target.value }))}>
              <option value="">请选择分类</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </SelectField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>标题 *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="文章标题" /></div>
            <div><Label>别名 *</Label><Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="文章别名" /></div>
            <div><Label>作者</Label><Input value={form.author} onChange={e => setForm({...form, author: e.target.value})} placeholder="作者名称" /></div>
            <div><Label>状态</Label>
              <SelectField aria-label="内容状态" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="DRAFT">草稿</option><option value="SCHEDULED">定时发布</option><option value="PUBLISHED">已发布</option></SelectField>
            </div>
            <div><Label htmlFor="publication-time">发布时间</Label><DateTimeField id="publication-time" value={form.published_at} onChange={e => setForm({...form, published_at: e.target.value})} /></div>
          </div>
          <div><Label>摘要</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>内容（HTML）</Label><RichTextEditor value={form.content_html} onChange={v => setForm({...form, content_html: v})} placeholder="请输入文章内容..." pickFromLibrary={openRichPicker} onBusyChange={setContentUploading} /></div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">封面图</h3>
            <p className={`mt-1 text-xs ${form.slug.trim() ? "text-gray-400" : "text-amber-600 dark:text-amber-400"}`}>
              {form.slug.trim()
                ? <>图片归属：媒体库 / News / <span className="font-medium">{form.slug.trim()}</span>；选择器内也可直接上传。</>
                : "请先填写别名；选择器内上传的图片将进入媒体库的“未分类”。"}
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {form.cover_image ? <img src={resolveMediaUrl(form.cover_image)} className="w-32 h-20 shrink-0 object-cover rounded-lg border" alt="Cover" /> : <div className="w-32 h-20 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">无封面</div>}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/news/x/cover.webp" />
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

        {isEdit && id && <ContentWorkflowPanel resource="news" id={id} onRestored={() => setReloadKey((value) => value + 1)} />}

        {/* 操作栏：移动端吸底常驻（长表单不必滚到底才能保存），≥640px 恢复原行内布局 */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 dark:border-gray-800 dark:bg-gray-900/95 sm:dark:bg-transparent">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除"}</Button>}</div>
          <div className="flex flex-1 justify-end gap-3 sm:flex-none">
            <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
            <Button type="submit" disabled={saving || coverUploading || contentUploading}>{saving ? "保存中..." : contentUploading ? "正文图片上传中..." : coverUploading ? "封面上传中..." : "保存"}</Button>
          </div>
        </div>
        </fieldset>
      </form>
      {/* 媒体选择器：封面（单选）/ 正文插图（多选，Promise 接入富文本编辑器）。
          上传归属默认 news:{slug}（后端自动建/复用 News/{slug} 相册），保证素材必有归属。 */}
      {coverPickerOpen && (
        <MediaPicker
          mode="single"
          categorizeHint={form.slug.trim() ? `news:${form.slug.trim()}` : undefined}
          onBusyChange={setCoverUploading}
          onClose={() => closeCoverPicker()}
          onConfirm={(picked) => closeCoverPicker(picked)}
        />
      )}
      {richPickerOpen && (
        <MediaPicker
          mode="multiple"
          categorizeHint={form.slug.trim() ? `news:${form.slug.trim()}` : undefined}
          onBusyChange={setContentUploading}
          onClose={() => closeRichPicker()}
          onConfirm={(picked) => closeRichPicker(picked)}
        />
      )}
      <ConfirmDialog
        open={deleteConfirm}
        title="删除文章"
        message="确定删除该文章吗？"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
