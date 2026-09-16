"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/api-client";

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

export default function ProductDetailImageEditor({ value, name, onChange, onBusyChange, upload }: {
  value: string; name: string; onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void; upload: (file: File) => Promise<string>;
}) {
  const parsed = useMemo(() => parse(value), [value]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (images: DetailImage[]) => onChange(serialize(parsed.text, images));

  async function add(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true); onBusyChange(true); setError("");
    const added: DetailImage[] = [];
    try {
      for (const file of files) {
        // Read dimensions before uploading so the public page can reserve the right ratio.
        const bitmap = await createImageBitmap(file);
        const width = String(bitmap.width), height = String(bitmap.height);
        bitmap.close();
        const src = await upload(file);
        added.push({ src, alt: name + " detail " + (parsed.images.length + added.length + 1), width, height });
      }
    } catch (error) { setError(error instanceof Error ? error.message : "详情图上传失败，请重试"); }
    finally {
      if (added.length) update([...parsed.images, ...added]);
      setBusy(false); onBusyChange(false);
    }
  }

  return <div className="space-y-3">
    <p className="text-sm text-gray-500">官网按顺序纵向展示详情图，不显示 Product Highlights 标题。建议图片宽度 1200–1600 px，优先使用 WebP；长图可分段上传。</p>
    <label className="block text-sm font-medium">上传商品详情图
      <input aria-label="上传商品详情图" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy}
        className="mt-2 block w-full" onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ""; void add(files); }} />
    </label>
    {busy && <p role="status">详情图上传中，请稍候…</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {parsed.images.map((img, index) => <div key={index} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <img src={resolveMediaUrl(img.src)} alt={img.alt} className="h-24 w-24 object-contain" />
      <label className="min-w-0 flex-1 text-sm">图片说明
        <input aria-label={"详情图 " + (index + 1) + " 说明"} value={img.alt}
          className="mt-1 w-full rounded border p-2"
          onChange={e => update(parsed.images.map((item, i) => i === index ? { ...item, alt: e.target.value } : item))} />
      </label>
      <button type="button" disabled={busy || index === 0} onClick={() => { const list = [...parsed.images]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; update(list); }}>上移</button>
      <button type="button" disabled={busy || index === parsed.images.length - 1} onClick={() => { const list = [...parsed.images]; [list[index], list[index + 1]] = [list[index + 1], list[index]]; update(list); }}>下移</button>
      <button type="button" disabled={busy} onClick={() => update(parsed.images.filter((_, i) => i !== index))}>移除此图</button>
    </div>)}
  </div>;
}
