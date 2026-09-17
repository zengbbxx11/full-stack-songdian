/*
 * 组件：RichTextEditor — 零依赖所见即所得 HTML 编辑器
 * ------------------------------------------------------------------
 * 基于 contentEditable + document.execCommand，无需任何 npm 包。
 * 生成的 HTML 仅含标准语义标签（h2/h3/p/b/i/a/ul/ol/li/blockquote/img），
 * 不含内联 style，确保经 cleanPostContent 清洗后与官网 .article-body 格式一致。
 *
 * 工具栏：H2 | H3 | B | I | Link | UL | OL | Quote | 插入图片（传入 upload 时才出现）| 清除格式
 *
 * 插入图片：点击后先把当前 Selection 的 Range 存下来（打开系统文件选择框会失焦丢选区），
 * 选图 → 上传拿到 URL → 还原 Range → insertHTML 插入 <img src alt width height>。
 * 宽高取自 createImageBitmap 的原始尺寸，官网据此预留比例并做响应式/懒加载。
 */

"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";

type Tool =
  | "h2" | "h3" | "bold" | "italic"
  | "link" | "ul" | "ol" | "quote" | "clear";

const TOOLS: { key: Tool; label: string; title: string }[] = [
  { key: "h2", label: "H2", title: "标题 2" },
  { key: "h3", label: "H3", title: "标题 3" },
  { key: "bold", label: "B", title: "加粗" },
  { key: "italic", label: "I", title: "斜体" },
  { key: "link", label: "🔗", title: "插入链接" },
  { key: "ul", label: "•≡", title: "无序列表" },
  { key: "ol", label: "1≡", title: "有序列表" },
  { key: "quote", label: "❝", title: "引用" },
  { key: "clear", label: "✕", title: "清除格式" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 图片上传函数（返回可访问 URL）；省略时不渲染「插入图片」按钮。 */
  upload?: (file: File) => Promise<string>;
  /** 上传期间通知父表单禁用保存，避免提交半成品内容。 */
  onBusyChange?: (busy: boolean) => void;
}

export default function RichTextEditor({ value, onChange, placeholder, upload, onBusyChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 打开系统文件选择框会让编辑区失焦、选区丢失，所以先存 Range，插入时再还原。
  const savedRange = useRef<Range | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    isInternalChange.current = true;
    onChange(el.innerHTML);
    // 下一个事件循环重置标记
    setTimeout(() => { isInternalChange.current = false; }, 0);
  }, [onChange]);

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

  // 记录插入位置后再打开文件选择框
  const pickImage = useCallback(() => {
    const el = editorRef.current;
    const selection = window.getSelection();
    savedRange.current =
      el && selection && selection.rangeCount > 0 && selection.anchorNode && el.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    fileRef.current?.click();
  }, []);

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
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.title}
            disabled={busy}
            onClick={() => exec(t.key)}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-40"
          >
            {t.label}
          </button>
        ))}
        {upload && (
          <button
            type="button"
            title="插入图片"
            disabled={busy}
            onClick={pickImage}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-40"
          >
            🖼
          </button>
        )}
      </div>

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

      {/* 编辑区 */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label={placeholder ?? "内容"}
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className="min-h-[200px] p-4 text-sm text-gray-800 dark:text-gray-200 focus:outline-none prose prose-sm max-w-none
          [&[data-placeholder]:empty:before]:content-[attr(data-placeholder)]
          [&[data-placeholder]:empty:before]:text-gray-400
          [&[data-placeholder]:empty:before]:pointer-events-none"
        style={{ lineHeight: 1.75 }}
      />

      {busy && <p role="status" className="px-3 py-2 text-xs text-gray-500">图片上传中，请稍候…</p>}
      {error && <p role="alert" className="px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
