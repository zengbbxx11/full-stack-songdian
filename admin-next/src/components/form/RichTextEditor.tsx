/*
 * 组件：RichTextEditor — 零依赖所见即所得 HTML 编辑器
 * ------------------------------------------------------------------
 * 基于 contentEditable + document.execCommand，无需任何 npm 包。
 * 生成的 HTML 仅含标准语义标签（h2/h3/p/b/i/a/ul/ol/li/blockquote），
 * 不含内联 style，确保经 cleanPostContent 清洗后与官网 .article-body 格式一致。
 *
 * 工具栏：H2 | H3 | B | I | Link | UL | OL | Quote | 清除格式
 */

"use client";

import React, { useRef, useCallback, useEffect } from "react";

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
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

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
    if (!el) return;
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
  }, [emitChange]);

  return (
    <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.title}
            onClick={() => exec(t.key)}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 编辑区 */}
      <div
        ref={editorRef}
        contentEditable
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
    </div>
  );
}
