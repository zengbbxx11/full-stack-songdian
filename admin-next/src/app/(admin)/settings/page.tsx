"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import React, { useState } from "react";
import useSWR from "swr";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { SettingItem } from "@/types";

// SMTP 配置键（归入「邮件通知」分组展示）
const SMTP_KEYS = new Set([
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_password",
  "inquiry_email_from",
  "inquiry_email_to",
]);

export default function SettingsPage() {
  const toast = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [editInitialized, setEditInitialized] = useState(false);

  const { data: settings, isLoading } = useSWR<Record<string, SettingItem>>(
    "/admin/settings",
    swrFetcher,
  );

  // 当 settings 加载完成后初始化 editValues
  React.useEffect(() => {
    if (settings && !editInitialized) {
      const values: Record<string, string> = {};
      Object.entries(settings).forEach(([k, v]) => {
        values[k] = v.value || "";
      });
      setEditValues(values);
      setEditInitialized(true);
    }
  }, [settings, editInitialized]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: editValues,
      });
      toast.success("设置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 测试 SMTP：先保存当前表单 → 用已保存配置发测试邮件
  async function handleTestSmtp() {
    setTesting(true);
    try {
      await apiFetch("/admin/settings", { method: "PUT", body: editValues });
      const res = await apiFetch<{ code: string; msg: string }>("/admin/settings/smtp/test", {
        method: "POST",
      });
      toast.success(res.msg || "测试邮件已发送");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(false);
    }
  }

  if (isLoading) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">设置</h2>
        <div className="space-y-4 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  const entries = settings ? Object.entries(settings) : [];
  const smtpEntries = entries.filter(([k]) => SMTP_KEYS.has(k));
  const otherEntries = entries.filter(([k]) => !SMTP_KEYS.has(k));

  const renderCard = (key: string, item: SettingItem) => (
    <div key={key} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between">
        <Label>{item.label || key}</Label>
        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 dark:bg-gray-800">{key}</code>
      </div>
      {item.description && <p className="mb-3 text-xs text-gray-400">{item.description}</p>}
      <Input
        value={editValues[key] || ""}
        onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
        placeholder="请输入内容..."
      />
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">设置</h2>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存修改"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* 邮件通知（SMTP）分组 */}
        {smtpEntries.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">邮件通知（询盘 SMTP）</h3>
              <Button size="sm" variant="outline" onClick={handleTestSmtp} disabled={testing || saving}>
                {testing ? "发送中..." : "测试发送"}
              </Button>
            </div>
            <p className="mb-4 text-xs text-gray-400">
              配置询盘邮件通知。保存后即时生效，无需重启。授权码只显示为 ******，未修改时保存会保留原值。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {smtpEntries.map(([key, item]) => renderCard(key, item))}
            </div>
          </section>
        )}

        {/* 其他设置 */}
        {otherEntries.map(([key, item]) => renderCard(key, item))}

        {settings && entries.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-gray-400">暂未配置任何设置。</p>
          </div>
        )}
      </div>
    </div>
  );
}
