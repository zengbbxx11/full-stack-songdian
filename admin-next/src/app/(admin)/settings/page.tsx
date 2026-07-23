"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import React, { useEffect, useState } from "react";

interface SettingItem {
  value: string;
  label: string;
  description: string;
}

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
}

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, SettingItem>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    fetch("/api/v1/admin/settings", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.code === "0") {
          setSettings(j.data || {});
          const values: Record<string, string> = {};
          Object.entries(j.data || {}).forEach(([k, v]: [string, any]) => {
            values[k] = v.value || "";
          });
          setEditValues(values);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    const token = getToken();
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(editValues),
      });
      const json = await res.json();
      if (json.code === "0") {
        toast.success(json.msg || "Settings saved");
      } else {
        toast.error(json.msg || "Save failed");
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="mb-6 text-2xl font-semibold text-gray-800 dark:text-white/90">Settings</h2>
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
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Settings</h2>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-4">
        {Object.entries(settings).map(([key, item]) => (
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
              placeholder="Enter value..."
            />
          </div>
        ))}

        {Object.keys(settings).length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-gray-400">No settings configured yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
