"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetch, swrFetcher } from "@/lib/api-client";
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
  if (process.env.NEXT_PUBLIC_FRONTEND_URL) return new URL(process.env.NEXT_PUBLIC_FRONTEND_URL).origin;
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
  const { data: revisions = [], error, isLoading, mutate } = useSWR<Revision[]>(`/admin/${resource}/${id}/revisions`, swrFetcher);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  async function preview() {
    if (previewing) return;
    setPreviewing(true);
    // 在用户点击时打开窗口，避免等待令牌请求后被浏览器判为弹窗。
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    try {
      const result = await apiFetch<{ token: string }>(`/admin/${resource}/${id}/preview-token`, { method: "POST" });
      const url = `${frontendOrigin()}/preview/${encodeURIComponent(result.token)}`;
      setPreviewUrl(url);
      if (previewWindow) previewWindow.location.replace(url);
    } catch (err) {
      previewWindow?.close();
      toast.error(err instanceof Error ? err.message : "生成预览失败");
    } finally {
      setPreviewing(false);
    }
  }

  async function restore(revision: Revision) {
    if (!window.confirm(`确定恢复到版本 v${revision.version}？内容和发布状态都会随版本恢复。当前已保存内容保留在版本历史中，未保存的编辑会丢失。`)) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/${resource}/${id}/revisions/${revision.id}/restore`, { method: "POST" });
      toast.success(`已恢复到版本 v${revision.version}`);
      void mutate().catch(() => undefined);
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
        <button type="button" disabled={previewing || loading} onClick={preview} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
          {previewing ? "生成预览中..." : "打开预览"}
        </button>
      </div>
      {previewUrl && <p className="mb-3 text-sm"><a href={previewUrl} target="_blank" rel="noopener noreferrer" className="underline text-brand-500">未自动打开？点击查看已保存内容</a></p>}
      {error ? <div role="alert" className="text-sm text-red-600">版本历史加载失败。<button type="button" onClick={() => void mutate().catch(() => undefined)} className="ml-2 underline">重试</button></div> : isLoading ? <p role="status">正在加载版本历史...</p> : revisions.length === 0 ? (
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
