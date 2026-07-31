"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { swrFetcher, apiFetch } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";
import ConfirmDialog from "@/components/common/ConfirmDialog";

interface AdminUserItem {
  id: number; username: string; email: string | null;
  status: string; created_time: string | null;
}

export default function UsersPage() {
  const toast = useToast();
  const { data: users, mutate } = useSWR<AdminUserItem[]>("/admin/users/list", swrFetcher);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserItem | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetting, setResetting] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      await apiFetch("/admin/users", { method: "POST", body: createForm });
      toast.success("User created");
      setCreateOpen(false); setCreateForm({ username: "", password: "" });
      mutate();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create failed"); }
    finally { setCreating(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("User deleted"); setDeleteTarget(null); mutate();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
    finally { setDeleting(false); }
  }

  async function handleReset() {
    if (!resetTarget || !resetPw) return;
    setResetting(true);
    try {
      await apiFetch(`/admin/users/${resetTarget.id}/reset-password`, { method: "PUT", body: { new_password: resetPw } });
      toast.success("Password reset"); setResetTarget(null); setResetPw("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Reset failed"); }
    finally { setResetting(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Users</h2>
        <button onClick={() => setCreateOpen(true)} className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">+ New</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Username</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {(users ?? []).map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">
                  {u.username}
                  {u.username === "admin" && <span className="ml-2 text-xs text-gray-400">(admin)</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${u.status === "ENABLED" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {u.status === "ENABLED" ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{u.created_time ? new Date(u.created_time).toLocaleDateString("zh-CN") : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setResetTarget(u); setResetPw(""); }} className="mr-2 text-xs text-blue-500 hover:text-blue-600">Reset</button>
                  <button onClick={() => setDeleteTarget(u)} disabled={u.username === "admin"} className="text-xs text-red-500 hover:text-red-600 disabled:opacity-30">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">New User</h3>
            <p className="mb-4 text-xs text-gray-400">All new accounts have full admin access.</p>
            <div className="space-y-3">
              <input type="text" value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))} placeholder="Username"
                className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} placeholder="Password"
                  className="w-full h-10 rounded-lg border border-gray-300 px-3 pr-10 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setCreateOpen(false)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={creating}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setResetTarget(null)} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Reset Password — {resetTarget.username}</h3>
            <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder="New password"
              className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setResetTarget(null)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">Cancel</button>
              <button onClick={handleReset} disabled={resetting || !resetPw}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600">
                {resetting ? "Resetting..." : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title="Delete User" message={`Delete ${deleteTarget?.username}?`}
        confirmText="Delete" loading={deleting} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
