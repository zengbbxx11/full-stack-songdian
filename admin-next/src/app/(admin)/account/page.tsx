"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import React, { useState } from "react";
import useSWR from "swr";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { AdminUser } from "@/types";

export default function AccountPage() {
  const toast = useToast();
  const { data: profile, mutate } = useSWR<AdminUser>("/admin/profile", swrFetcher);

  // 修改用户名
  const [newUsername, setNewUsername] = useState("");
  const [usernameMsg, setUsernameMsg] = useState("");

  // 修改密码
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  // 当 profile 加载完成后初始化 newUsername
  React.useEffect(() => {
    if (profile && !newUsername) {
      setNewUsername(profile.username);
    }
  }, [profile, newUsername]);

  // 更新用户名
  async function handleUpdateUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || newUsername === profile?.username) {
      setUsernameMsg("用户名未变化");
      return;
    }
    setUsernameMsg("");
    try {
      const updated = await apiFetch<AdminUser>("/admin/profile", {
        method: "PUT",
        body: { username: newUsername.trim() },
      });
      mutate(updated);
      setUsernameMsg("用户名修改成功");
    } catch (err) {
      setUsernameMsg(err instanceof Error ? err.message : "修改失败");
    }
  }

  // 修改密码
  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPwd) { setPwdMsg("请输入当前密码"); return; }
    if (!newPwd || newPwd.length < 6) { setPwdMsg("新密码至少 6 位"); return; }
    if (newPwd !== confirmPwd) { setPwdMsg("两次输入的密码不一致"); return; }
    setPwdMsg("");
    try {
      await apiFetch("/admin/profile", {
        method: "PUT",
        body: { current_password: currentPwd, new_password: newPwd },
      });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdMsg("密码修改成功，下次登录请使用新密码");
    } catch (err) {
      setPwdMsg(err instanceof Error ? err.message : "修改失败");
    }
  }

  if (!profile) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">Account Settings</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="space-y-4 animate-pulse">
            <div className="h-5 w-40 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-5 w-60 rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">Account Settings</h2>

      {/* 当前信息 */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-sm font-medium text-gray-500 uppercase">Current Account</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-400">Username:</span> <span className="font-medium text-gray-800 dark:text-white/90">{profile.username}</span></div>
          <div><span className="text-gray-400">Email:</span> <span className="text-gray-800 dark:text-white/90">{profile.email || "—"}</span></div>
          <div><span className="text-gray-400">Role:</span> <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{profile.role_name || "—"}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 修改用户名 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Change Username</h3>
          <form onSubmit={handleUpdateUsername} className="space-y-4">
            <div>
              <Label>New Username</Label>
              <Input
                placeholder="Enter new username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            {usernameMsg && (
              <p className={`text-sm ${usernameMsg.includes("成功") ? "text-green-600" : "text-red-500"}`}>
                {usernameMsg}
              </p>
            )}
            <Button size="sm" type="submit">Update Username</Button>
          </form>
        </div>

        {/* 修改密码 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Change Password</h3>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                placeholder="Enter current password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                placeholder="Re-enter new password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
              />
            </div>
            {pwdMsg && (
              <p className={`text-sm ${pwdMsg.includes("成功") ? "text-green-600" : "text-red-500"}`}>
                {pwdMsg}
              </p>
            )}
            <Button size="sm" type="submit">Change Password</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
