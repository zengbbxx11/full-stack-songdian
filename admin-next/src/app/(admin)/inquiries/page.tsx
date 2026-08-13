/*
 * 页面：询盘管理页（/inquiries）
 * 职责：展示官网提交的询盘列表，支持搜索、状态流转（五态 CRM 管线）、
 * 分配销售人员、标签编辑、跟进记录时间线。
 *
 * 后端状态枚举（common/enums.py 2026-07-31 CRM 升级）：
 *   NEW → CONTACTING → QUOTED → DEAL / LOST
 *
 * 新增端点：
 *   PUT  /admin/inquiries/{id}/assign       — 分配/取消分配
 *   POST /admin/inquiries/{id}/follow-note  — 追加跟进
 */
"use client";
import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Button from "@/components/ui/button/Button";
import { apiFetch, apiFetchAllPages, swrFetcher } from "@/lib/api-client";
import type { AdminUser, Inquiry, InquiryStatus, FollowNote, Paginated } from "@/types";

/* ── 各状态对应徽章样式 ── */
const STATUS_BADGE: Record<InquiryStatus, string> = {
  NEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  CONTACTING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  QUOTED: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  DEAL: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  LOST: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

/* ── 合法状态流转映射（非终态才显示操作按钮） ── */
const NEXT_STATUS: Record<InquiryStatus, InquiryStatus[]> = {
  NEW: ["CONTACTING", "LOST"],
  CONTACTING: ["QUOTED", "LOST"],
  QUOTED: ["DEAL", "LOST"],
  DEAL: [],
  LOST: [],
};

const STATUS_LABEL: Record<InquiryStatus, string> = {
  NEW: "新询盘",
  CONTACTING: "联系中",
  QUOTED: "已报价",
  DEAL: "已成交",
  LOST: "已丢单",
};

export default function InquiriesPage() {
  const toast = useToast();

  /* ── 数据 ── */
  const { data, error, isLoading, mutate } = useSWR<Paginated<Inquiry>, Error>(
    "/admin/inquiries?page_size=50",
    (path: string) => apiFetchAllPages<Inquiry>(path)
  );
  const items = useMemo(() => data?.list ?? [], [data?.list]);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [utmFilter, setUtmFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* ── 管理员列表（分配下拉） ── */
  const { data: adminUsers = [] } = useSWR<AdminUser[]>(
    "/admin/users",
    (path: string) => swrFetcher<AdminUser[]>(path)
  );

  /* ── 回复/操作对话框 ── */
  const [reply, setReply] = useState<{
    open: boolean; target: Inquiry | null; note: string; status: InquiryStatus; country: string;
  }>({ open: false, target: null, note: "", status: "CONTACTING", country: "" });
  const [replySaving, setReplySaving] = useState(false);

  /* ── 状态切换确认 ── */
  const [statusConfirm, setStatusConfirm] = useState<{
    open: boolean; target: Inquiry | null; next: InquiryStatus;
  }>({ open: false, target: null, next: "LOST" });
  const [statusSaving, setStatusSaving] = useState(false);

  /* ── 删除确认 ── */
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean; target: Inquiry | null;
  }>({ open: false, target: null });
  const [deleteSaving, setDeleteSaving] = useState(false);

  /* ── 分配对话框 ── */
  const [assignTarget, setAssignTarget] = useState<Inquiry | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  /* ── 标签编辑 ── */
  const [tagTarget, setTagTarget] = useState<Inquiry | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagSaving, setTagSaving] = useState(false);

  /* ── 列表加载失败 ── */
  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : "加载询盘失败");
  }, [error, toast]);

  /* ── 本地搜索过滤 ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((i) => {
      const matchesSearch = !q ||
        i.name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        (i.company?.toLowerCase().includes(q) ?? false) ||
        i.message.toLowerCase().includes(q);
      const matchesCountry = !countryFilter ||
        (i.country?.toLowerCase().includes(countryFilter.toLowerCase()) ?? false);
      const matchesProduct = !productFilter ||
        (i.source_product?.toLowerCase().includes(productFilter.toLowerCase()) ?? false);
      const matchesUtm = !utmFilter ||
        (i.utm_source?.toLowerCase().includes(utmFilter.toLowerCase()) ?? false);
      return matchesSearch && matchesCountry && matchesProduct && matchesUtm;
    });
  }, [search, countryFilter, productFilter, utmFilter, items]);

  /* ── 操作：打开回复/状态对话框 ── */
  async function openReply(i: Inquiry) {
    setReply({ open: true, target: i, note: "", status: "CONTACTING", country: "" });
    try {
      const detail = await apiFetch<Inquiry>(`/admin/inquiries/${i.id}`);
      setReply((prev) => ({
        ...prev,
        note: detail.reply_note || "",
        status: detail.status,
        country: detail.country || "",
      }));
    } catch { /* 详情拉取失败不阻塞，沿用列表数据 */ }
  }

  async function submitReply() {
    if (!reply.target) return;
    setReplySaving(true);
    try {
      await apiFetch(`/admin/inquiries/${reply.target.id}/status`, {
        method: "PUT",
        body: { status: reply.status, reply_note: reply.note, country: reply.country },
      });
      // 同时追加一条跟进记录
      if (reply.note.trim()) {
        await apiFetch(`/admin/inquiries/${reply.target.id}/follow-note`, {
          method: "POST",
          body: { note: `[状态 → ${reply.status}] ${reply.note}` },
        }).catch(() => { /* 跟进记录失败不阻塞主操作 */ });
      }
      await mutate();
      toast.success("已保存");
      setReply({ open: false, target: null, note: "", status: "CONTACTING", country: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setReplySaving(false);
    }
  }

  /* ── 操作：状态流转 ── */
  async function confirmStatusChange() {
    if (!statusConfirm.target) return;
    setStatusSaving(true);
    try {
      await apiFetch(`/admin/inquiries/${statusConfirm.target.id}/status`, {
        method: "PUT",
        body: { status: statusConfirm.next },
      });
      await mutate();
      toast.success(`已标记为 ${statusConfirm.next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setStatusSaving(false);
      setStatusConfirm({ open: false, target: null, next: "LOST" });
    }
  }

  /* ── 操作：删除 ── */
  async function confirmDeleteInquiry() {
    if (!deleteConfirm.target) return;
    setDeleteSaving(true);
    try {
      await apiFetch(`/admin/inquiries/${deleteConfirm.target.id}`, { method: "DELETE" });
      await mutate();
      toast.success("询盘已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteSaving(false);
      setDeleteConfirm({ open: false, target: null });
    }
  }

  /* ── 操作：分配 ── */
  async function doAssign(userId: number | null) {
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      await apiFetch(`/admin/inquiries/${assignTarget.id}/assign`, {
        method: "PUT",
        body: { assigned_user_id: userId },
      });
      await mutate();
      toast.success(userId ? "已分配" : "已取消分配");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分配失败");
    } finally {
      setAssignSaving(false);
      setAssignTarget(null);
    }
  }

  /* ── 操作：保存标签 ── */
  async function saveTags() {
    if (!tagTarget) return;
    setTagSaving(true);
    try {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await apiFetch(`/admin/inquiries/${tagTarget.id}/status`, {
        method: "PUT",
        body: { status: tagTarget.status, tags },
      });
      await mutate();
      toast.success("标签已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "标签更新失败");
    } finally {
      setTagSaving(false);
      setTagTarget(null);
      setTagInput("");
    }
  }

  /* ── 渲染 ── */
  return (
    <div>
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">询盘</h2>
        <span className="text-sm text-gray-400">{filtered.length} of {items.length}</span>
      </div>

      {/* 搜索框 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名、邮箱、公司或留言..."
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder:text-gray-500"
        />
        <input value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} placeholder="按国家筛选" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" />
        <input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder="按来源产品筛选" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" />
        <input value={utmFilter} onChange={(event) => setUtmFilter(event.target.value)} placeholder="按 UTM 来源筛选" className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" />
      </div>

      {/* 手机端卡片：操作保持完整可见，避免横向表格隐藏负责人和状态。 */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">
            {search ? "无匹配询盘" : "暂无询盘"}
          </div>
        ) : filtered.map((i) => (
          <article id={`inquiry-${i.id}`} key={i.id} className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-800 dark:text-white/90">{i.name}</h3>
                <p className="mt-0.5 break-all text-xs text-gray-500">{i.email}</p>
                {i.company && <p className="mt-0.5 text-xs text-gray-400">{i.company}</p>}
              </div>
              <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${STATUS_BADGE[i.status]}`}>
                {STATUS_LABEL[i.status]}
              </span>
            </div>

            <button onClick={() => setExpandedId(expandedId === i.id ? null : i.id)} className="mt-4 block w-full text-left">
              <p className={`text-sm leading-relaxed text-gray-600 dark:text-gray-300 ${expandedId === i.id ? "" : "line-clamp-3"}`}>{i.message}</p>
              {i.message.length > 90 && <span className="mt-1 inline-block text-xs text-brand-500">{expandedId === i.id ? "收起" : "展开全部"}</span>}
            </button>

            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
              <p>国家：{i.country || "未知"}</p>
              <p className="mt-1">来源产品：{i.source_product || "未记录"}</p>
              <p className="mt-1">UTM：{i.utm_source || "直接访问 / 未记录"}</p>
              {i.utm_campaign && <p className="mt-1">活动：{i.utm_campaign}</p>}
              {i.landing_page && <p className="mt-1 break-all">落地页：{i.landing_page}</p>}
              {i.referrer && <p className="mt-1 break-all">引荐：{i.referrer}</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-xs dark:border-gray-800">
              <button onClick={() => setAssignTarget(i)} className="rounded-lg bg-gray-50 px-3 py-2 text-left text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                负责人：{i.assigned_user_name || "未分配"}
              </button>
              <button onClick={() => { setTagTarget(i); setTagInput((i.tags || []).join(", ")); }} className="rounded-lg bg-gray-50 px-3 py-2 text-left text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                标签：{i.tags?.length ? i.tags.join("、") : "无"}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => openReply(i)} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600">跟进记录</button>
              {NEXT_STATUS[i.status].map((nextStatus) => (
                <button key={nextStatus} onClick={() => setStatusConfirm({ open: true, target: i, next: nextStatus })} className={`rounded-lg border px-3 py-2 text-xs font-medium ${nextStatus === "LOST" ? "border-red-200 text-red-500" : "border-green-200 text-green-700"}`}>
                  转为{STATUS_LABEL[nextStatus]}
                </button>
              ))}
              <button onClick={() => setDeleteConfirm({ open: true, target: i })} className="ml-auto rounded-lg px-2 py-2 text-xs text-red-400">删除</button>
            </div>
          </article>
        ))}
      </div>

      {/* 表格 */}
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">姓名</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">邮箱</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">来源</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">留言</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">负责人</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">标签</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">状态</th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" style={{ width: "60%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  {search ? "无匹配询盘" : "暂无询盘"}
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr id={`inquiry-${i.id}`} key={i.id} className="scroll-mt-24 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-3 font-medium text-gray-800 dark:text-white/90">{i.name}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{i.email}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    <div>{i.country || "未知国家"}</div>
                    <div className="mt-1 text-gray-400">{i.source_product || i.product_interest || "未记录产品"}</div>
                    <div className="mt-1 text-gray-400">{i.utm_source ? `UTM: ${i.utm_source}` : "直接访问 / 未记录"}</div>
                  </td>
                  <td className="px-3 py-3 text-gray-500 max-w-[240px]">
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
                    {/* 跟进时间线 */}
                    {expandedId === i.id && i.follow_notes && i.follow_notes.length > 0 && (
                      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                        {i.follow_notes.map((fn: FollowNote, idx: number) => (
                          <div key={idx} className="rounded bg-gray-50 p-1.5 text-xs text-gray-500 dark:bg-gray-800">
                            <span className="font-medium text-gray-600 dark:text-gray-300">
                              {fn.user} · {fn.time?.slice(0, 19).replace("T", " ")}
                            </span>
                            <div className="mt-0.5">{fn.note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {expandedId === i.id && (
                      <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs leading-5 text-gray-500 dark:bg-gray-800">
                        <div>落地页：{i.landing_page || "未记录"}</div>
                        <div>引荐：{i.referrer || "未记录"}</div>
                        <div>UTM 活动：{i.utm_campaign || "未记录"}</div>
                      </div>
                    )}
                  </td>
                  {/* 负责人 */}
                  <td className="px-3 py-3 text-gray-500 text-xs">
                    <button
                      onClick={() => setAssignTarget(i)}
                      className="text-left hover:text-brand-500 cursor-pointer"
                    >
                      {i.assigned_user_name || <span className="text-gray-300 italic">未分配</span>}
                    </button>
                  </td>
                  {/* 标签 */}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {i.tags && i.tags.length > 0 ? (
                        i.tags.map((t) => (
                          <span key={t} className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-300 italic">无</span>
                      )}
                      <button
                        onClick={() => { setTagTarget(i); setTagInput((i.tags || []).join(", ")); }}
                        className="text-xs text-gray-400 hover:text-brand-500"
                      >+</button>
                    </div>
                  </td>
                  {/* 状态徽章 */}
                  <td className="px-3 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[i.status]}`}>
                      {STATUS_LABEL[i.status]}
                    </span>
                  </td>
                  {/* 操作按钮 */}
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button onClick={() => openReply(i)} className="text-xs text-brand-500 hover:text-brand-600">
                        跟进
                      </button>
                      {NEXT_STATUS[i.status].map((ns) => (
                        <button
                          key={ns}
                          onClick={() => setStatusConfirm({ open: true, target: i, next: ns })}
                          className={`text-xs ${ns === "LOST" ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}
                        >
                          → {ns}
                        </button>
                      ))}
                      {i.status !== "LOST" && i.status !== "DEAL" && NEXT_STATUS[i.status].length === 0 && (
                        <span className="text-xs text-gray-300">终态</span>
                      )}
                      <button
                        onClick={() => setDeleteConfirm({ open: true, target: i })}
                        className="text-xs text-red-400 hover:text-red-500 ml-1"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ──────────────────── 回复/跟进对话框 ──────────────────── */}
      {reply.open && reply.target && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !replySaving && setReply((p) => ({ ...p, open: false }))} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              跟进 {reply.target.name}
            </h3>
            <p className="mb-4 text-xs text-gray-400">{reply.target.email}</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">状态</label>
                <select
                  value={reply.status}
                  onChange={(e) => setReply((p) => ({ ...p, status: e.target.value as InquiryStatus }))}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="NEW">NEW — 新询盘</option>
                  <option value="CONTACTING">CONTACTING — 已联系</option>
                  <option value="QUOTED">QUOTED — 已报价</option>
                  <option value="DEAL">DEAL — 成交</option>
                  <option value="LOST">LOST — 丢单</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">国家 <span className="text-xs text-gray-400 font-normal">（后台手动标记）</span></label>
                <input
                  type="text"
                  value={reply.country}
                  onChange={(e) => setReply((p) => ({ ...p, country: e.target.value }))}
                  placeholder="如 China, USA, Germany"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">备注 / 回复内容</label>
                <textarea
                  value={reply.note}
                  onChange={(e) => setReply((p) => ({ ...p, note: e.target.value }))}
                  rows={4}
                  placeholder="记录本次跟进内容..."
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setReply((p) => ({ ...p, open: false }))} disabled={replySaving}>
                取消
              </Button>
              <Button size="sm" onClick={submitReply} disabled={replySaving}>
                {replySaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────── 分配对话框 ──────────────────── */}
      {assignTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAssignTarget(null)} />
          <div className="relative w-full max-w-xs mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">
              分配给 {assignTarget.name}
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => doAssign(null)}
                disabled={assignSaving}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <span className="text-gray-400 italic">取消分配</span>
              </button>
              {adminUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => doAssign(u.id)}
                  disabled={assignSaving}
                  className={`w-full rounded-lg border px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    assignTarget.assigned_user_id === u.id
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {u.username}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────── 标签编辑对话框 ──────────────────── */}
      {tagTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTagTarget(null)} />
          <div className="relative w-full max-w-xs mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">编辑标签</h3>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="逗号分隔，如 VIP, sample, hot"
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 mb-4"
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setTagTarget(null)} disabled={tagSaving}>取消</Button>
              <Button size="sm" onClick={saveTags} disabled={tagSaving}>
                {tagSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────── 状态切换确认 ──────────────────── */}
      <ConfirmDialog
        open={statusConfirm.open}
        title="确认状态变更"
        message={`确定将「${statusConfirm.target?.name}」标记为 ${statusConfirm.next}？`}
        confirmText={`→ ${statusConfirm.next}`}
        loading={statusSaving}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusConfirm({ open: false, target: null, next: "LOST" })}
      />

      {/* ──────────────────── 删除确认 ──────────────────── */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="删除询盘"
        message={`确定要删除来自「${deleteConfirm.target?.name}」的询盘吗？此操作不可撤销。`}
        confirmText="删除"
        loading={deleteSaving}
        onConfirm={confirmDeleteInquiry}
        onCancel={() => setDeleteConfirm({ open: false, target: null })}
      />
    </div>
  );
}
