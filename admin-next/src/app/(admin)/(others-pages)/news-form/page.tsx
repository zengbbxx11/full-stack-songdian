/*
 * 页面：新闻编辑/创建表单页（/news-form?id=X）
 * 职责：新闻的创建和编辑表单。支持标题/内容（富文本编辑器）、分类下拉选择、
 * 封面图上传。编辑模式下通过 URL query ?id=X 加载既有新闻数据，
 * 提交走 POST/PUT /api/v1/admin/news。
 */
"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import RichTextEditor from "@/components/form/RichTextEditor";
import { useToast } from "@/context/ToastContext";
import { apiFetch, API_BASE } from "@/lib/api-client";
import type { NewsItem } from "@/types";

export default function NewsFormPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const isEdit = !!id;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", summary: "", content_html: "", author: "", status: "DRAFT", cover_image: "", published_at: "" });
  const toast = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadingData(true);
    apiFetch<NewsItem>(`/admin/news/${id}`).then((p) => {
      setForm({ title: p.title || "", slug: p.slug || "", summary: p.summary || "", content_html: p.content_html || "", author: p.author || "", status: p.status || "DRAFT", cover_image: p.cover_image || "", published_at: typeof p.published_at === "string" ? p.published_at.substring(0, 16) : "" });
    }).catch((err: unknown) => {
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      toast.error("加载文章失败：" + msg);
    }).finally(() => setLoadingData(false));
  }, [id, toast]);

  // 上传图片文件到后端 → 返回 URL
  async function uploadImage(file: File, newsSlug?: string): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    if (newsSlug) formData.append("categorize", `news:${newsSlug}`);
    const result = await apiFetch<{ url: string }>("/admin/upload", {
      method: "POST",
      body: formData,
    });
    return `${API_BASE}${result.url}`;
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await uploadImage(file, form.slug); setForm(prev => ({ ...prev, cover_image: url.replace(API_BASE, "") })); }
    catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      // 如果未填写发布时间则从请求体中移除，避免空字符串导致后端 Pydantic 校验失败
      const payload: Record<string, unknown> = { ...form };
      if (!payload.published_at) delete payload.published_at;
      if (isEdit) await apiFetch(`/admin/news/${id}`, { method: "PUT", body: payload });
      else await apiFetch("/admin/news", { method: "POST", body: payload });
      router.push("/news");
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存失败"); } finally { setSaving(false); }
  }

  function handleDelete() {
    setDeleteConfirm(true);
  }

  async function handleConfirmDelete() {
    setDeleteConfirm(false);
    setDeleting(true);
    try { await apiFetch(`/admin/news/${id}`, { method: "DELETE" }); toast.success("文章已删除"); router.push("/news"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "删除失败"); setDeleting(false); }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">{isEdit ? "编辑新闻" : "新建文章"}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">文章信息</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>标题 *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="文章标题" /></div>
            <div><Label>别名 *</Label><Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="文章别名" /></div>
            <div><Label>作者</Label><Input value={form.author} onChange={e => setForm({...form, author: e.target.value})} placeholder="作者名称" /></div>
            <div><Label>状态</Label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option></select></div>
            <div><Label>发布时间</Label><Input type="datetime-local" value={form.published_at} onChange={e => setForm({...form, published_at: e.target.value})} /></div>
          </div>
          <div><Label>摘要</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>内容（HTML）</Label><RichTextEditor value={form.content_html} onChange={v => setForm({...form, content_html: v})} placeholder="请输入文章内容..." /></div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">封面图</h3>
          <div className="flex items-start gap-4">
            {form.cover_image ? <img src={`${API_BASE}${form.cover_image}`} className="w-32 h-20 object-cover rounded-lg border" alt="Cover" /> : <div className="w-32 h-20 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">无封面</div>}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/news/x/cover.webp" />
              <label className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">上传图片<input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" /></label>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除"}</Button>}</div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>取消</Button>
            <Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
          </div>
        </div>
      </form>
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
