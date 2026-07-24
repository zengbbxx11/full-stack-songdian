/*
 * 页面：新闻编辑/创建表单页（/news-form?id=X）
 * 职责：新闻的创建和编辑表单。支持标题/内容（Quill 编辑器）、分类下拉选择、
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
import { useToast } from "@/context/ToastContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() { return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // POST/PUT 需要 Content-Type
  if (opts?.method && opts.method !== "GET" && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...opts, headers: { ...headers, ...opts?.headers } });
  const json = await res.json();
  if (json.code !== "0") throw new Error(json.msg || "Failed");
  return json.data;
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData(); formData.append("file", file);
  const token = getToken();
  const res = await fetch("/api/v1/admin/upload", { method: "POST", body: formData, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await res.json();
  if (json.code !== "0") throw new Error(json.msg);
  return `${API_BASE}${json.data.url}`;
}

export default function NewsFormPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const isEdit = !!id;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", summary: "", content_html: "", author: "", status: "DRAFT", cover_image: "" });
  const toast = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    // 无 token 直接跳登录，不要无谓地调 API
    const token = getToken();
    if (!token) {
      router.push(`/signin?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setLoadingData(true);
    apiFetch(`/api/v1/admin/news/${id}`).then((p: Record<string, string | null>) => {
      setForm({ title: p.title || "", slug: p.slug || "", summary: p.summary || "", content_html: p.content_html || "", author: p.author || "", status: p.status || "DRAFT", cover_image: p.cover_image || "" });
    }).catch((err: unknown) => {
      const msg: string = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to load article: " + msg);
    }).finally(() => setLoadingData(false));
  }, [id]);

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await uploadImage(file); setForm(prev => ({ ...prev, cover_image: url.replace(API_BASE, "") })); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      if (isEdit) await apiFetch(`/api/v1/admin/news/${id}`, { method: "PUT", body: JSON.stringify(form) });
      else await apiFetch("/api/v1/admin/news", { method: "POST", body: JSON.stringify(form) });
      router.push("/news");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); } finally { setSaving(false); }
  }

  function handleDelete() {
    setDeleteConfirm(true);
  }

  async function handleConfirmDelete() {
    setDeleteConfirm(false);
    setDeleting(true);
    try { await apiFetch(`/api/v1/admin/news/${id}`, { method: "DELETE" }); toast.success("Article deleted"); router.push("/news"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Delete failed"); setDeleting(false); }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mb-6">{isEdit ? "Edit News" : "New Article"}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">Article Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Article title" /></div>
            <div><Label>Slug *</Label><Input value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder="article-slug" /></div>
            <div><Label>Author</Label><Input value={form.author} onChange={e => setForm({...form, author: e.target.value})} placeholder="Author name" /></div>
            <div><Label>Status</Label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></div>
          </div>
          <div><Label>Summary</Label><textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} rows={3} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
          <div><Label>Content (HTML)</Label><textarea value={form.content_html} onChange={e => setForm({...form, content_html: e.target.value})} rows={10} className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" /></div>
        </div>

        {/* 封面图 */}
        <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">Cover Image</h3>
          <div className="flex items-start gap-4">
            {form.cover_image ? <img src={`${API_BASE}${form.cover_image}`} className="w-32 h-20 object-cover rounded-lg border" alt="Cover" /> : <div className="w-32 h-20 bg-gray-100 dark:bg-gray-800 rounded-lg border flex items-center justify-center text-gray-400 text-sm">No cover</div>}
            <div className="flex-1 space-y-3">
              <Input value={form.cover_image} onChange={e => setForm({...form, cover_image: e.target.value})} placeholder="/uploads/news/x/cover.webp" />
              <label className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">Upload Image<input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" /></label>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <div>{isEdit && <Button variant="outline" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</Button>}</div>
          <div className="flex gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Article"
        message="Delete this article?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
