/*
 * 组件：RichTextEditor — 零依赖所见即所得 HTML 编辑器 + HTML 源码模式
 * ------------------------------------------------------------------
 * 基于 contentEditable + document.execCommand，无需任何 npm 包。
 * 生成的 HTML 仅含标准语义标签（h2/h3/p/b/i/a/ul/ol/li/blockquote/img），
 * 不含内联 style，确保经 cleanPostContent 清洗后与官网 .article-body 格式一致。
 *
 * 两种模式（共用同一份 content_html，切换不丢内容）：
 * - 可视化（默认）：H2 | H3 | B | I | 链接 | UL | OL | 引用 | 清除格式 | 插入图片
 * - HTML 源码：等宽 textarea，可直接粘贴完整 HTML 代码来确定内容与格式
 *
 * 插入图片：点击后先把当前 Selection 的 Range 存下来（打开系统文件选择框会失焦丢选区），
 * 选图 → 上传拿到 URL → 还原 Range → insertHTML 插入 <img src alt width height>。
 * 宽高取自 createImageBitmap 的原始尺寸，官网据此预留比例并做响应式/懒加载。
 */

"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { ImagePlus, Link2, List, ListOrdered, Quote, RemoveFormatting } from "lucide-react";

import { measureImage, type PickedMedia } from "@/components/media/types";

type Tool =
  | "h2" | "h3" | "bold" | "italic"
  | "link" | "ul" | "ol" | "quote" | "clear";

type EditorMode = "visual" | "html";

/** 工具条：文字类用字母（H2/B/I 是排版惯例），功能类统一用 lucide 图标（不用 emoji）。 */
const TOOLS: { key: Tool; label?: string; icon?: React.ReactNode; title: string }[] = [
  { key: "h2", label: "H2", title: "标题 2" },
  { key: "h3", label: "H3", title: "标题 3" },
  { key: "bold", label: "B", title: "加粗" },
  { key: "italic", label: "I", title: "斜体" },
  { key: "link", icon: <Link2 className="h-3.5 w-3.5" />, title: "插入链接" },
  { key: "ul", icon: <List className="h-3.5 w-3.5" />, title: "无序列表" },
  { key: "ol", icon: <ListOrdered className="h-3.5 w-3.5" />, title: "有序列表" },
  { key: "quote", icon: <Quote className="h-3.5 w-3.5" />, title: "引用" },
  { key: "clear", icon: <RemoveFormatting className="h-3.5 w-3.5" />, title: "清除格式" },
];

const TABS: { key: EditorMode; label: string }[] = [
  { key: "visual", label: "可视化" },
  { key: "html", label: "HTML 源码" },
];

const TAB_BASE = "rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40";
// 触摸端把工具按钮加大到 40px（原 28px 手指点不准，后台其它移动端操作也统一 40px），≥768px 恢复原尺寸
const TOOL_BASE = "inline-flex h-10 min-w-10 items-center justify-center rounded px-2 text-xs font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 md:h-7 md:min-w-7 dark:text-gray-300 dark:hover:bg-gray-700";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 图片上传函数（返回可访问 URL）；省略时不渲染「插入图片」按钮。 */
  upload?: (file: File) => Promise<string>;
  /** 从媒体库插入（表单主入口）：打开选择器并按选择顺序插入；省略时不渲染对应按钮。 */
  pickFromLibrary?: () => Promise<PickedMedia[]>;
  /** 上传/插入期间通知父表单禁用保存，避免提交半成品内容。 */
  onBusyChange?: (busy: boolean) => void;
}

export default function RichTextEditor({ value, onChange, placeholder, upload, pickFromLibrary, onBusyChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 打开系统文件选择框会让编辑区失焦、选区丢失，所以先存 Range，插入时再还原。
  const savedRange = useRef<Range | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 默认可视化：既有 e2e 以 getByRole("textbox", { name: "请输入文章内容..." }) 定位编辑区。
  const [mode, setMode] = useState<EditorMode>("visual");

  // 外部 value 变化时同步到编辑器（仅在非编辑中时触发，避免光标跳动）
  useEffect(() => {
    const el = editorRef.current;
    if (!el || isInternalChange.current) return;
    // 只在内容确实不同时才更新，避免失焦
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    // 源码模式下**不接受**可视化区的 input/blur 回写：编辑区被隐藏后浏览器可能延迟派发 blur，
    // 那时用旧的 el.innerHTML 覆盖会丢掉刚在源码里粘贴的代码（数据被回滚）。
    if (mode !== "visual") return;
    isInternalChange.current = true;
    onChange(el.innerHTML);
    // 下一个事件循环重置标记
    setTimeout(() => { isInternalChange.current = false; }, 0);
  }, [onChange, mode]);

  const exec = useCallback((tool: Tool) => {
    const el = editorRef.current;
    if (!el || busy) return;
    el.focus();

    switch (tool) {
      case "h2":
        document.execCommand("formatBlock", false, "<h2>");
        break;
      case "h3":
        document.execCommand("formatBlock", false, "<h3>");
        break;
      case "bold":
        document.execCommand("bold");
        break;
      case "italic":
        document.execCommand("italic");
        break;
      case "ul":
        document.execCommand("insertUnorderedList");
        break;
      case "ol":
        document.execCommand("insertOrderedList");
        break;
      case "quote":
        document.execCommand("formatBlock", false, "<blockquote>");
        break;
      case "link": {
        const url = prompt("请输入链接地址：", "https://");
        if (url) document.execCommand("createLink", false, url);
        break;
      }
      case "clear":
        document.execCommand("removeFormat");
        break;
    }
    emitChange();
  }, [emitChange, busy]);

  // 记录当前插入位置（可视化编辑区内），插入时恢复
  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    const selection = window.getSelection();
    savedRange.current =
      el && selection && selection.rangeCount > 0 && selection.anchorNode && el.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
  }, []);

  // 记录插入位置后再打开文件选择框
  const pickImage = useCallback(() => {
    saveSelection();
    fileRef.current?.click();
  }, [saveSelection]);

  /** 从媒体库插入：选中素材按顺序插入到上次光标位置（宽高口径与上传路径一致）。 */
  async function insertFromLibrary() {
    if (!pickFromLibrary || busy) return;
    saveSelection();
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const picked = await pickFromLibrary();
      const parts: string[] = [];
      for (const item of picked) {
        let size = "";
        try {
          const dimensions = await measureImage(item.url);
          size = ` width="${dimensions.width}" height="${dimensions.height}"`;
        } catch { /* 保留无宽高版本 */ }
        const alt = (item.title ?? "").replace(/"/g, "");
        parts.push(`<img src="${item.url}" alt="${alt}"${size}>`);
      }
      if (!parts.length) return;
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const selection = window.getSelection();
      if (selection && savedRange.current) {
        selection.removeAllRanges();
        selection.addRange(savedRange.current);
      }
      document.execCommand("insertHTML", false, parts.join(""));
      emitChange();
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : "插入图片失败，请重试");
    } finally {
      savedRange.current = null;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function insertImages(files: File[]) {
    if (!upload || busy) return;
    const images = files.filter(file => file.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const parts: string[] = [];
      for (const file of images) {
        // 先量原始宽高，官网据此预留比例并做响应式/懒加载；量不到就退化为不带宽高。
        let size = "";
        try {
          const bitmap = await createImageBitmap(file);
          size = ` width="${bitmap.width}" height="${bitmap.height}"`;
          bitmap.close();
        } catch { /* 保留无宽高版本 */ }
        const src = await upload(file);
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/"/g, "");
        parts.push(`<img src="${src}" alt="${alt}"${size}>`);
      }
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const selection = window.getSelection();
      if (selection && savedRange.current) {
        selection.removeAllRanges();
        selection.addRange(savedRange.current);
      }
      document.execCommand("insertHTML", false, parts.join(""));
      emitChange();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "图片上传失败，请重试");
    } finally {
      savedRange.current = null;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* 模式切换：可视化 / HTML 源码（共用同一份内容；上传中禁止切换，避免插入落空） */}
      <div role="tablist" aria-label="正文编辑模式" className="flex items-center gap-1 px-2 pt-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={mode === tab.key}
            disabled={busy}
            onClick={() => setMode(tab.key)}
            className={`${TAB_BASE} ${mode === tab.key ? "bg-gray-50 text-[#3E6AE1] dark:bg-gray-800 dark:text-[#7C97F0]" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 工具栏（仅可视化模式） */}
      {mode === "visual" && (
        <div className="flex flex-wrap gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {TOOLS.map((t) => (
            <button key={t.key} type="button" title={t.title} disabled={busy} onClick={() => exec(t.key)} className={TOOL_BASE}>
              {t.icon ?? t.label}
            </button>
          ))}
          {pickFromLibrary && (
            <button type="button" title="从媒体库插入图片" disabled={busy} onClick={() => void insertFromLibrary()} className={TOOL_BASE}>
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {upload && (
            <button type="button" title="插入图片" disabled={busy} onClick={pickImage} className={TOOL_BASE}>
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 隐藏的图片选择框：与工具栏按钮配对，选完立即清空以便连续选择同一文件 */}
      {upload && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="插入图片"
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files || [])];
            event.target.value = "";
            void insertImages(files);
          }}
        />
      )}

      {/* 编辑区（可视化）：HTML 模式下仅隐藏、保持挂载，切回时内容不丢 */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label={placeholder ?? "内容"}
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className={`min-h-[200px] p-4 text-sm text-gray-800 dark:text-gray-200 focus:outline-none prose prose-sm max-w-none
          [&[data-placeholder]:empty:before]:content-[attr(data-placeholder)]
          [&[data-placeholder]:empty:before]:text-gray-400
          [&[data-placeholder]:empty:before]:pointer-events-none
          ${mode === "visual" ? "" : "hidden"}`}
        style={{ lineHeight: 1.75 }}
      />

      {/* 源码区（HTML）：等宽字体，直接编辑同一份 content_html */}
      {mode === "html" && (
        <>
          <textarea
            aria-label="HTML 源码"
            value={value}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            className="block w-full min-h-[200px] resize-y bg-[#F9FAFB] p-4 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#3E6AE1]/40 dark:bg-gray-950 dark:text-gray-200"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace", lineHeight: 1.6 }}
          />
          <p className="px-3 py-2 text-[11px] leading-relaxed text-gray-500 bg-[#F9FAFB] border-t border-gray-200 dark:bg-gray-950 dark:text-gray-400 dark:border-gray-700">
            可直接粘贴完整 HTML，内容与结构以代码为准。允许：p / h1–h6 / ul / ol / li / a / img（含 width、height）/ table / thead / tbody / tr / th / td / strong / em / blockquote / code / pre / figure / figcaption / mark / small / s / del；
            <span className="font-semibold">内联 style 会被清除</span>，版式统一由站点样式接管；script、on* 事件属性与 javascript: 一律移除。
          </p>
        </>
      )}

      {busy && <p role="status" className="px-3 py-2 text-xs text-gray-500">图片上传中，请稍候…</p>}
      {error && <p role="alert" className="px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
