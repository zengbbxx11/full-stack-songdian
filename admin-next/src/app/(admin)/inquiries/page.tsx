/*
 * 页面：询盘管理页（/inquiries）
 * 职责：展示官网提交的询盘列表，支持搜索、展开查看详情、回复（写入 reply_note 并把状态置为 REPLIED）、
 * 以及一键标记为 REPLIED / ARCHIVED。状态流转统一走 PUT /api/v1/admin/inquiries/{id}/status。
 *
 * 后端状态枚举（inquiry/models.py）：NEW / REPLIED / ARCHIVED。
 *
 * 相关 issue：#5（统一 API 客户端）、#16（统一错误提示）、#22（回复 + 状态流转）、#24（表格横向滚动）。
 */
"use client";
import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Button from "@/components/ui/button/Button";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { Inquiry, InquiryStatus, Paginated } from "@/types";

/** 各状态对应的徽章样式。 */
const STATUS_BADGE: Record<InquiryStatus, string> = {
  NEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  REPLIED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  ARCHIVED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function InquiriesPage() {
  const toast = useToast();
  // 列表数据交由 SWR 管理（issue #23）：data 即已解包的分页信封，加载/错误状态由 hook 提供。
  const { data, error, isLoading, mutate } = useSWR<Paginated<Inquiry>, Error>(
    "/admin/inquiries?page_size=100",
    (path: string) => swrFetcher<Paginated<Inquiry>>(path)
  );
  const items = data?.list ?? [];
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 回复对话框
  const [reply, setReply] = useState<{ open: boolean; target: Inquiry | null; note: string; status: InquiryStatus }>({
    open: false,
    target: null,
    note: "",
    status: "REPLIED",
  });
  const [replySaving, setReplySaving] = useState(false);

  // 状态切换确认
  const [statusConfirm, setStatusConfirm] = useState<{ open: boolean; target: Inquiry | null; next: InquiryStatus }>({
    open: false,
    target: null,
    next: "ARCHIVED",
  });
  const [statusSaving, setStatusSaving] = useState(false);
  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; target: Inquiry | null }>({ open: false, target: null });
  const [deleteSaving, setDeleteSaving] = useState(false);

  // 列表加载失败：沿用原行为弹出错误提示（SWR 仅在 fetcher 抛错时置 error）。
  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "加载询盘失败");
  }, [error]);

  // 本地搜索过滤（基于 SWR 返回的 items 派生，无需独立 state）
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        (i.company?.toLowerCase().includes(q) ?? false) ||
        i.message.toLowerCase().includes(q)
    );
  }, [search, items]);

  // 打开回复对话框：拉取详情以回填已有 reply_note
  async function openReply(i: Inquiry) {
    setReply({ open: true, target: i, note: "", status: "REPLIED" });
    try {
      const detail = await apiFetch<Inquiry>(`/admin/inquiries/${i.id}`);
      setReply((prev) => ({ ...prev, note: detail.reply_note || "", status: detail.status }));
    } catch {
      // 详情拉取失败不阻塞回复；沿用当前状态
    }
  }

  async function submitReply() {
    if (!reply.target) return;
    setReplySaving(true);
    try {
      await apiFetch<Inquiry>(`/admin/inquiries/${reply.target.id}/status`, {
        method: "PUT",
        body: { status: reply.status, reply_note: reply.note },
      });
      // 变更成功后让 SWR 重新拉取列表，保证与后端一致（issue #23）。
      await mutate();
      toast.success("回复已保存");
      setReply({ open: false, target: null, note: "", status: "REPLIED" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setReplySaving(false);
    }
  }

  async function confirmStatusChange() {
    if (!statusConfirm.target) return;
    setStatusSaving(true);
    try {
      await apiFetch<Inquiry>(`/admin/inquiries/${statusConfirm.target.id}/status`, {
        method: "PUT",
        body: { status: statusConfirm.next, reply_note: statusConfirm.target.reply_note },
      });
      await mutate();
      toast.success(`已标记为 ${statusConfirm.next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setStatusSaving(false);
      setStatusConfirm({ open: false, target: null, next: "ARCHIVED" });
    }
  }

  async function confirmDeleteInquiry() {
    if (!deleteConfirm.target) return;
    setDeleteSaving(true);
    try {
      await apiFetch(`/admin/inquiries/${deleteConfirm.target.id}`, { method: "DELETE" });
      await mutate();
      toast.success("Inquiry deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteSaving(false);
      setDeleteConfirm({ open: false, target: null });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Inquiries</h2>
        <span className="text-sm text-gray-400">
          {filtered.length} of {items.length}
        </span>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, company, or message..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500 lg:w-96"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Company</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Message</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
                        style={{ width: "60%", animationDelay: `${i * 0.1}s` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {search ? "No matching inquiries" : "No inquiries yet"}
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{i.name}</td>
                  <td className="px-4 py-3 text-gray-500">{i.email}</td>
                  <td className="px-4 py-3 text-gray-500">{i.company || "-"}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[280px]">
                    <button
                      onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
                      className="text-left hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                    >
                      <span className={expandedId === i.id ? "" : "line-clamp-2"}>{i.message}</span>
                      {i.message.length > 60 && (
                        <span className="ml-1 text-xs text-brand-500">
                          {expandedId === i.id ? "▲ Less" : "▼ More"}
                        </span>
                      )}
                    </button>
                    {expandedId === i.id && i.reply_note && (
                      <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-500 dark:bg-gray-800">
                        <span className="font-medium text-gray-600 dark:text-gray-300">Reply: </span>
                        {i.reply_note}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[i.status]}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => openReply(i)} className="text-sm text-brand-500 hover:text-brand-600">
                        Reply
                      </button>
                      {i.status !== "REPLIED" && (
                        <button
                          onClick={() => setStatusConfirm({ open: true, target: i, next: "REPLIED" })}
                          className="text-sm text-green-600 hover:text-green-700"
                        >
                          Mark Replied
                        </button>
                      )}
                      {i.status !== "ARCHIVED" && (
                        <button
                          onClick={() => setStatusConfirm({ open: true, target: i, next: "ARCHIVED" })}
                          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirm({ open: true, target: i })}
                        className="text-sm text-red-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 回复对话框 */}
      {reply.open && reply.target && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !replySaving && setReply({ open: false, target: null, note: "", status: "REPLIED" })} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Reply to {reply.target.name}</h3>
            <p className="mb-4 text-xs text-gray-400">{reply.target.email}</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select
                  value={reply.status}
                  onChange={(e) => setReply((p) => ({ ...p, status: e.target.value as InquiryStatus }))}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="NEW">NEW</option>
                  <option value="REPLIED">REPLIED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reply Message</label>
                <textarea
                  value={reply.note}
                  onChange={(e) => setReply((p) => ({ ...p, note: e.target.value }))}
                  rows={5}
                  placeholder="Write your reply..."
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReply({ open: false, target: null, note: "", status: "REPLIED" })}
                disabled={replySaving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={submitReply} disabled={replySaving}>
                {replySaving ? "Saving..." : "Save Reply"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 状态切换确认 */}
      <ConfirmDialog
        open={statusConfirm.open}
        title={statusConfirm.next === "ARCHIVED" ? "Archive Inquiry" : "Mark as Replied"}
        message={`Are you sure you want to mark "${statusConfirm.target?.name}" as ${statusConfirm.next}?`}
        confirmText={statusConfirm.next === "ARCHIVED" ? "Archive" : "Mark Replied"}
        loading={statusSaving}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusConfirm({ open: false, target: null, next: "ARCHIVED" })}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Inquiry"
        message={`Are you sure you want to delete inquiry from "${deleteConfirm.target?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        loading={deleteSaving}
        onConfirm={confirmDeleteInquiry}
        onCancel={() => setDeleteConfirm({ open: false, target: null })}
      />
    </div>
  );
}
