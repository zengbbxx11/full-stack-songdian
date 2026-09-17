"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/api-client";
import ConfirmDialog from "@/components/common/ConfirmDialog";

type DetailImage = { src: string; alt: string; width: string; height: string };
function parse(html: string) {
  if (typeof DOMParser === "undefined") return { text: html, images: [] as DetailImage[] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = [...doc.querySelectorAll("img")].map(img => {
    const data = { src: img.getAttribute("src") || "", alt: img.alt, width: img.getAttribute("width") || "", height: img.getAttribute("height") || "" };
    img.remove();
    return data;
  });
  return { text: doc.body.innerHTML, images };
}
function serialize(text: string, images: DetailImage[]) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  for (const data of images) {
    const img = doc.createElement("img");
    for (const [key, value] of Object.entries(data)) if (value) img.setAttribute(key, value);
    doc.body.append(img);
  }
  return doc.body.innerHTML;
}

export default function ProductDetailImageEditor({ value, name, onChange, onBusyChange, onDirtyChange, upload }: {
  value: string; name: string; onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
  upload: (file: File) => Promise<string>;
}) {
  const parsed = useMemo(() => parse(value), [value]);
  const [error, setError] = useState("");
  // 逐张上传的失败清单（按文件名）：与“正在上传 x/y”一起给运营明确反馈，整体失败不再只报一句。
  const [failed, setFailed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

  // 任何一次改动都上报“脏”，由表单决定 beforeunload 与“取消”拦截；保存成功后表单复位。
  const update = (images: DetailImage[]) => { onChange(serialize(parsed.text, images)); onDirtyChange?.(true); };

  async function add(files: File[]) {
    const list = files.filter(file => file.type.startsWith("image/"));
    if (busy || !list.length) return;
    setBusy(true); onBusyChange(true); setError(""); setFailed([]);
    const added: DetailImage[] = [];
    const failures: string[] = [];
    try {
      for (const [index, file] of list.entries()) {
        // 进度按“正在上传第几张”呈现，比“已完成数”更贴近运营看到的顺序。
        setProgress({ done: index + 1, total: list.length });
        try {
          // Read dimensions before uploading so the public page can reserve the right ratio.
          const bitmap = await createImageBitmap(file);
          const width = String(bitmap.width), height = String(bitmap.height);
          bitmap.close();
          const src = await upload(file);
          added.push({ src, alt: name + " detail " + (parsed.images.length + added.length + 1), width, height });
        } catch (error) {
          failures.push(file.name + "：" + (error instanceof Error ? error.message : "上传失败"));
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "详情图上传失败，请重试");
    } finally {
      if (added.length) update([...parsed.images, ...added]);
      if (failures.length) setFailed(failures);
      setProgress(null); setBusy(false); onBusyChange(false);
    }
  }

  return <div
    role="group"
    aria-label="商品详情图"
    className={"space-y-3 rounded-lg border border-dashed p-3 transition-colors " + (dragging ? "border-[#3E6AE1] bg-blue-50/60 dark:bg-blue-950/20" : "border-transparent")}
    onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); void add([...event.dataTransfer.files]); }}
  >
    <p className="text-sm text-gray-500">官网按顺序纵向展示详情图，不显示 Product Highlights 标题。建议图片宽度 1200–1600 px，优先使用 WebP；长图可分段上传。也可以把图片直接拖进这块区域。</p>
    <label className="block text-sm font-medium">上传商品详情图
      <input aria-label="上传商品详情图" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy}
        className="mt-2 block w-full" onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ""; void add(files); }} />
    </label>
    {progress && <p role="status">正在上传第 {progress.done}/{progress.total} 张…</p>}
    {failed.length > 0 && <ul role="alert" className="text-sm text-red-600">{failed.map(item => <li key={item}>{item}</li>)}</ul>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {parsed.images.length === 0 && !busy && <p className="text-sm text-gray-400">暂无详情图：点上方“选择文件”，或把图片拖进这块区域。</p>}
    {parsed.images.map((img, index) => <div key={index} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <img src={resolveMediaUrl(img.src)} alt={img.alt} className="h-24 w-24 object-contain" />
      <label className="min-w-0 flex-1 text-sm">图片说明
        <input aria-label={"详情图 " + (index + 1) + " 说明"} value={img.alt}
          className="mt-1 w-full rounded border p-2"
          onChange={e => update(parsed.images.map((item, i) => i === index ? { ...item, alt: e.target.value } : item))} />
      </label>
      <button type="button" disabled={busy || index === 0} onClick={() => { const list = [...parsed.images]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; update(list); }}>上移</button>
      <button type="button" disabled={busy || index === parsed.images.length - 1} onClick={() => { const list = [...parsed.images]; [list[index], list[index + 1]] = [list[index + 1], list[index]]; update(list); }}>下移</button>
      <button type="button" disabled={busy} onClick={() => setPendingRemove(index)}>移除此图</button>
    </div>)}
    <ConfirmDialog
      open={pendingRemove !== null}
      title="移除详情图"
      message="确定移除这张详情图吗？保存产品后官网才会同步。"
      confirmText="移除"
      onConfirm={() => { if (pendingRemove !== null) update(parsed.images.filter((_, i) => i !== pendingRemove)); setPendingRemove(null); }}
      onCancel={() => setPendingRemove(null)}
    />
  </div>;
}
