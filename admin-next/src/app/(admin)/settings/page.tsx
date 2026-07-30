"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import React, { useState } from "react";
import useSWR from "swr";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import type { SettingItem } from "@/types";

export default function SettingsPage() {
  const toast = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">设置</h2>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存修改"}
        </Button>
      </div>

      <div className="space-y-4">
        {settings && Object.entries(settings).map(([key, item]) => (
          <div key={key} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between">
              <Label>{item.label || key}</Label>
              <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 dark:bg-gray-800">{key}</code>
            </div>
            {item.description && (
              <p className="mb-3 text-xs text-gray-400">{item.description}</p>
            )}
            <Input
              value={editValues[key] || ""}
              onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder="请输入内容..."
            />
          </div>
        ))}

        {settings && Object.keys(settings).length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-gray-400">暂未配置任何设置。</p>
          </div>
        )}
      </div>
    </div>
  );
}
