"use client";
/* eslint-disable @next/next/no-img-element */
/*
 * 组件：ProductDetailImageEditor — 商品详情图编辑器（序列化进 content_html）
 * ------------------------------------------------------------------
 * 呈现层为「说明 + 主操作 → 缩略图网格（序号/尺寸/说明/图标按钮）」，支持：
 * - 从媒体库选择（表单主入口，选中后自动归档关系不变）；
 * - 拖拽文件到整块区域上传（边框变蓝高亮，素材同样归入该产品相册）；
 * - 网格内拖拽排序（HTML5 DnD），落点有蓝色描边提示，同时保留上移/下移按钮；
 * - 上传进度、按文件名的失败清单、移除二次确认、空态引导。
 * 既有可访问名（商品详情图 / 详情图 N 说明 / 上移 / 下移 / 移除此图 /
 * 移除 / 暂无详情图 / 正在上传第 x/y 张）是 e2e 契约，改动时不要重命名。
 */
import { useMemo, useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2, UploadCloud } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api-client";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { measureImage, type PickedMedia } from "@/components/media/types";

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

export default function ProductDetailImageEditor({ value, name, onChange, onBusyChange, onDirtyChange, upload, pickFromLibrary }: {
  value: string; name: string; onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
  /** 拖拽上传仍走该回调（素材自动归入该产品相册） */
  upload: (file: File) => Promise<string>;
  /** 从媒体库选择（表单主入口）：返回选中素材（按选择顺序），取消时返回空数组 */
  pickFromLibrary?: () => Promise<PickedMedia[]>;
}) {
  const parsed = useMemo(() => parse(value), [value]);
  const [error, setError] = useState("");
  // 逐张上传的失败清单（按文件名）：与“正在上传 x/y”一起给运营明确反馈，整体失败不再只报一句。
  const [failed, setFailed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // 排序拖拽的状态：dragIndex = 被拖起的格子，overIndex = 当前落点（用于高亮）
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

  // 任何一次改动都上报“脏”，由表单决定 beforeunload 与“取消”拦截；保存成功后表单复位。
  const update = (images: DetailImage[]) => { onChange(serialize(parsed.text, images)); onDirtyChange?.(true); };

  /** 把 from 位置的图片移动到 to 位置（拖拽排序与上移/下移共用）。 */
  function move(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= parsed.images.length) return;
    const list = [...parsed.images];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    update(list);
  }

  /** 只处理「拖文件」的悬停/放下：排序拖拽由格子自身处理，避免整块区域误高亮。 */
  const isFileDrag = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes("Files");

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

  /** 从媒体库选择：选中后逐张读宽高并按选择顺序追加（拖拽上传仍可用，二者都会归档到相册）。 */
  async function addFromLibrary() {
    if (busy || !pickFromLibrary) return;
    setBusy(true); onBusyChange(true); setError(""); setFailed([]);
    try {
      const picked = await pickFromLibrary();
      const added: DetailImage[] = [];
      for (const item of picked) {
        let width = "", height = "";
        try {
          const size = await measureImage(item.url);
          width = String(size.width); height = String(size.height);
        } catch { /* 量不到宽高时保留空值，与上传路径的降级一致 */ }
        added.push({ src: item.url, alt: `${name} detail ${parsed.images.length + added.length + 1}`, width, height });
      }
      if (added.length) update([...parsed.images, ...added]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "从媒体库添加失败，请重试");
    } finally {
      setBusy(false); onBusyChange(false);
    }
  }

  const iconButton = "inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-[#3E6AE1] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-900/90 dark:text-gray-300";

  return <div
    role="group"
    aria-label="商品详情图"
    className={"space-y-4 rounded-2xl border p-4 transition-colors " + (dragging ? "border-[#3E6AE1] bg-blue-50/60 dark:bg-blue-950/20" : "border-gray-200 dark:border-gray-700")}
    onDragOver={event => { if (busy || !isFileDrag(event)) return; event.preventDefault(); setDragging(true); }}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
    onDrop={event => {
      setDragging(false);
      if (busy || event.dataTransfer.files.length === 0) return;  // 排序拖拽不带 files，交给格子处理
      event.preventDefault();
      void add([...event.dataTransfer.files]);
    }}
  >
    {/* 说明 + 主操作 */}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm text-gray-500 dark:text-gray-400">
        官网按顺序纵向展示详情图。请从媒体库选择已上传的图片（自动归档到本产品相册），也可以把图片直接拖进这块区域。
      </p>
      <button
        type="button"
        disabled={busy || !pickFromLibrary}
        onClick={() => void addFromLibrary()}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#3E6AE1] px-4 text-sm font-medium text-[#3E6AE1] transition-colors hover:bg-[#3E6AE1] hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <UploadCloud aria-hidden="true" className="h-4 w-4" />
        从媒体库选择
      </button>
    </div>

    {progress && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">正在上传第 {progress.done}/{progress.total} 张…</p>}
    {failed.length > 0 && <ul role="alert" className="text-sm text-red-600">{failed.map(item => <li key={item}>{item}</li>)}</ul>}
    {error && <p role="alert" className="text-red-600">{error}</p>}

    {parsed.images.length === 0 && !busy ? (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-400 dark:border-gray-700">
        暂无详情图：点上方「从媒体库选择」，或把图片拖进这块区域。
      </p>
    ) : (
      <ul className={"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 " + (busy ? "pointer-events-none opacity-70" : "")}>
        {parsed.images.map((img, index) => (
          <li
            key={index}
            draggable={!busy}
            onDragStart={event => { setDragIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            onDragOver={event => { if (isFileDrag(event) || dragIndex === null || dragIndex === index) return; event.preventDefault(); setOverIndex(index); }}
            onDrop={event => {
              if (dragIndex === null) return;           // 文件拖放交给外层容器
              event.preventDefault(); event.stopPropagation();
              move(dragIndex, index);
              setDragIndex(null); setOverIndex(null);
            }}
            className={"group relative overflow-hidden rounded-xl border bg-white transition-all dark:bg-gray-800 " +
              (overIndex === index && dragIndex !== null ? "border-[#3E6AE1] ring-2 ring-[#3E6AE1]/40 " : "border-gray-200 dark:border-gray-700 ") +
              (dragIndex === index ? "opacity-50" : "")}
          >
            <div className="relative h-32 w-full bg-[#F2F3F4] dark:bg-gray-900">
              <img src={resolveMediaUrl(img.src)} alt={img.alt} className="h-full w-full object-contain" />
              <span className="absolute left-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1.5 text-[11px] font-semibold text-white">{index + 1}</span>
              {/* 图标按钮：默认半透明，悬停/键盘聚焦时完全显现（opacity 不影响可点击性） */}
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" aria-label="上移" title="上移" disabled={busy || index === 0} onClick={() => move(index, index - 1)} className={iconButton}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="下移" title="下移" disabled={busy || index === parsed.images.length - 1} onClick={() => move(index, index + 1)} className={iconButton}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="移除此图" title="移除此图" disabled={busy} onClick={() => setPendingRemove(index)} className={iconButton + " hover:text-red-600 dark:hover:text-red-400"}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <span aria-hidden="true" title="拖动排序" className="absolute bottom-1.5 left-1.5 cursor-grab rounded-md bg-white/85 p-0.5 text-gray-500 opacity-60 transition-opacity group-hover:opacity-100 dark:bg-gray-900/85 dark:text-gray-400">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="space-y-1 p-2">
              <p className="text-[11px] text-gray-400">{index === 0 ? "封面下方第 1 张" : `第 ${index + 1} 张`}{img.width && img.height ? ` · ${img.width}×${img.height}` : ""}</p>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                图片说明
                <input aria-label={"详情图 " + (index + 1) + " 说明"} value={img.alt}
                  className="mt-1 w-full rounded-md border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 transition-colors focus:border-[#3E6AE1] focus:outline-none dark:border-gray-700 dark:text-gray-200"
                  onChange={e => update(parsed.images.map((item, i) => i === index ? { ...item, alt: e.target.value } : item))} />
              </label>
            </div>
          </li>
        ))}
      </ul>
    )}

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
