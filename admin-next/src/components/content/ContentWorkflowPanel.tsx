"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";

type ResourceType = "products" | "news";
type Revision = {
  id: number;
  version: number;
  change_type: string;
  created_by: string | null;
  created_time: string;
};

function frontendOrigin(): string {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return `${protocol}//${hostname}:3000`;
  if (hostname.startsWith("admin.")) return `${protocol}//www.${hostname.slice(6)}`;
  return `${protocol}//${hostname}`;
}

export default function ContentWorkflowPanel({
  resource,
  id,
  onRestored,
}: {
  resource: ResourceType;
  id: string;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRevisions() {
    try {
      setRevisions(await apiFetch<Revision[]>(`/admin/${resource}/${id}/revisions`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载版本历史失败");
    }
  }

  useEffect(() => { void loadRevisions(); }, [id, resource]); // eslint-disable-line react-hooks/exhaustive-deps

  async function preview() {
    try {
      const result = await apiFetch<{ token: string }>(`/admin/${resource}/${id}/preview-token`, { method: "POST" });
      window.open(`${frontendOrigin()}/preview/${encodeURIComponent(result.token)}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成预览失败");
    }
  }

  async function restore(revision: Revision) {
    if (!window.confirm(`确定恢复到版本 v${revision.version}？当前内容会先保留为版本历史。`)) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/${resource}/${id}/revisions/${revision.id}/restore`, { method: "POST" });
      toast.success(`已恢复到版本 v${revision.version}`);
      await loadRevisions();
      onRestored();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "恢复版本失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">预览与版本历史</h3>
          <p className="mt-1 text-xs text-gray-500">预览链接有效 15 分钟，只展示最后一次已保存内容。</p>
        </div>
        <button type="button" onClick={preview} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
          打开预览
        </button>
      </div>
      {revisions.length === 0 ? (
        <p className="text-sm text-gray-400">保存后将自动生成版本记录。</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {revisions.map((revision) => (
            <div key={revision.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
              <div>
                <span className="font-medium">v{revision.version}</span>
                <span className="ml-2 text-gray-500">{revision.change_type}</span>
                <span className="ml-2 text-xs text-gray-400">{new Date(revision.created_time).toLocaleString()}</span>
              </div>
              <button type="button" disabled={loading} onClick={() => restore(revision)} className="text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50">
                恢复
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
