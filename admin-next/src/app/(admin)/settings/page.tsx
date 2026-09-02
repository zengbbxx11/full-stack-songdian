"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import React, { useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api-client";
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
  // 只存用户修改的字段；其余字段直接显示最新服务端数据，避免旧缓存锁死表单。
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const operationInFlight = useRef(false);

  const { data: settings, isLoading, isValidating, error, mutate } = useSWR<Record<string, SettingItem>>(
    "/admin/settings",
    (path: string) => apiFetch<Record<string, SettingItem>>(path, { cache: "no-store" }),
  );

  const changes = Object.fromEntries(Object.entries(editValues).filter(([key, value]) => {
    if (!settings || !Object.hasOwn(settings, key)) return false;
    // 授权码留空或仍为掩码表示不修改，不把它作为真实密码提交。
    if (key === "smtp_password" && (!value || value === "******")) return false;
    return value !== (settings[key].value ?? "");
  }));
  const hasChanges = Object.keys(changes).length > 0;
  const busy = saving || testing;

  async function saveChanges() {
    if (!hasChanges) return;
    const submitted = { ...changes };
    // 用 mutate 包住写入，阻止较早发出的读取请求覆盖保存结果。
    // 缓存仅保留脱敏后的授权码；普通字段保存后立即回显。
    await mutate(async (current) => {
      await apiFetch("/admin/settings", { method: "PUT", body: submitted });
      const next = { ...(current ?? settings) };
      for (const [key, value] of Object.entries(submitted)) {
        next[key] = {
          ...next[key],
          value: key === "smtp_password" ? "******" : value,
        };
      }
      return next;
    }, { revalidate: false });
    setEditValues({});
    // 读取失败不误报为保存失败；页面保留已保存值并展示重试提示。
    void mutate().catch(() => undefined);
  }

  async function handleSave() {
    if (operationInFlight.current || !settings || error || !hasChanges) return;
    operationInFlight.current = true;
    setSaving(true);
    try {
      await saveChanges();
      toast.success("设置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      operationInFlight.current = false;
      setSaving(false);
    }
  }

  // 测试 SMTP：先保存当前表单 → 用已保存配置发测试邮件
  async function handleTestSmtp() {
    if (operationInFlight.current || !settings || error) return;
    operationInFlight.current = true;
    setTesting(true);
    try {
      await saveChanges();
      const res = await apiFetch<{ code: string; msg: string }>("/admin/settings/smtp/test", {
        method: "POST",
      });
      toast.success(res.msg || "测试邮件已发送");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试失败");
    } finally {
      operationInFlight.current = false;
      setTesting(false);
    }
  }

  if (isLoading && !settings && !error) {
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
        <Label htmlFor={`setting-${key}`}>{item.label || key}</Label>
        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 dark:bg-gray-800">{key}</code>
      </div>
      {item.description && <p className="mb-3 text-xs text-gray-400">{item.description}</p>}
      <Input
        id={`setting-${key}`}
        type={key === "smtp_password" ? "password" : "text"}
        value={editValues[key] ?? item.value ?? ""}
        onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
        disabled={busy}
        placeholder={key === "smtp_password" && item.value ? "已配置，留空保留原值" : "请输入内容..."}
      />
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {Object.hasOwn(changes, key)
          ? "有未保存修改"
          : item.value
            ? key === "smtp_password" ? "已配置（不显示明文）；不修改或留空均保留原值" : "已配置"
            : "未配置"}
      </p>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">设置</h2>
        <Button size="sm" onClick={handleSave} disabled={busy || !settings || !!error || !hasChanges}>
          {saving ? "保存中..." : "保存修改"}
        </Button>
      </div>

      <div className="space-y-6">
        {(error || (!settings && !isLoading)) && (
          <div role="alert" className="rounded-xl border border-error-300 p-5 text-sm text-error-700 dark:text-error-400">
            <p>{settings ? "设置重新读取失败，当前内容已保留。请重试后再保存。" : "设置加载失败，无法确认已保存的内容。请重试。"}</p>
            <Button size="sm" variant="outline" onClick={() => { void mutate().catch(() => undefined); }} disabled={isValidating || busy}>
              {isValidating ? "重新读取中..." : "重新读取设置"}
            </Button>
          </div>
        )}
        {/* 邮件通知（SMTP）分组 */}
        {smtpEntries.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">邮件通知（询盘 SMTP）</h3>
              <Button size="sm" variant="outline" onClick={handleTestSmtp} disabled={busy || !!error}>
                {testing ? "发送中..." : "测试发送"}
              </Button>
            </div>
            <p className="mb-4 text-xs text-gray-400">
              配置询盘邮件通知。保存后即时生效，无需重启。已保存的授权码不显示明文，未修改或留空时保留原值。
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
