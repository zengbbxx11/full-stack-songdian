/*
 * 组件：RichTextEditor — 新闻正文的纯 HTML 代码编辑器（含沙箱预览）
 * ------------------------------------------------------------------
 * 2026-09-22 改造：删掉「可视化 / HTML 源码」双模式与 document.execCommand 那套逻辑，
 * 只留一个等宽 textarea。正文本身就是 HTML，直接写/粘代码最省事，也少掉一层模式守卫的
 * 补偿代码；顺带去掉一个隐患 —— 原来可视化区会执行 `el.innerHTML = value`，粘贴带
 * onerror 的图片会在后台页面里触发脚本，代码模式不再把内容当 HTML 解析。
 *
 * 插图：点「从媒体库插入图片」→ 选择器（可多选、可在选择器内上传）→ 读原图宽高 →
 * 在 textarea **当前光标处**插入 `<img src alt width height>`。宽高必须带：官网据此预留
 * 比例防 CLS。光标定位有三处易踩的坑，这里都处理了：
 * - textarea 从未聚焦时 `selectionStart` 是 0（不是末尾）→ 用「是否交互过」标记判断，
 *   没交互过就追加到末尾，避免图片莫名插到开头；
 * - 打开选择器会让 textarea 失焦，但 `selectionStart/End` 仍保留 → 不需要旧版
 *   "存 Range → 还原选区" 的绕行；
 * - 插入用的 `value` 必须取最新（选择器打开期间可能已被外部改动），因此走 `valueRef`，
 *   落光标则放到 `value` 更新后的 effect 里做，不依赖 requestAnimationFrame 时序。
 *
 * 预览：见 ArticlePreviewFrame —— 清洗后渲染在 <iframe sandbox=""> 里（强制安全边界）。
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { measureImage, type PickedMedia } from "@/components/media/types";
import ArticlePreviewFrame from "./ArticlePreviewFrame";

// 触摸端按钮加大到 40px（与后台其它移动端操作一致），≥768px 恢复紧凑尺寸
const TOOL_BASE =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 md:h-7 md:min-w-7 dark:text-gray-300 dark:hover:bg-gray-700";
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CODE_FONT: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\", monospace",
  lineHeight: 1.6,
  tabSize: 2,
};

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 从媒体库插入（表单主入口）：打开选择器并按选择顺序插入到光标处；省略时不渲染对应按钮。 */
  pickFromLibrary?: () => Promise<PickedMedia[]>;
  /** 上传/插入期间通知父表单禁用保存，避免提交半成品内容。 */
  onBusyChange?: (busy: boolean) => void;
}

export default function RichTextEditor({ value, onChange, placeholder, pickFromLibrary, onBusyChange }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 用户是否在代码框里交互过（点过/选过）。没交互过时 selectionStart 恒为 0，不能直接拿来当插入位置。
  const touchedRef = useRef(false);
  // 待落光标位置：插入后由 effect 在 value 更新完成时设置选区。
  const pendingCaret = useRef<number | null>(null);
  const valueRef = useRef(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 同步最新内容：插入发生在 await 选择器之后，闭包里的 value 可能已过期
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 内容更新完成后再落光标（受控组件，不能在 onChange 同帧设选区）
  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const field = textareaRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(caret, caret);
  }, [value]);

  /** 在光标处插入片段，光标落到插入内容末尾；未交互过则追加到末尾。 */
  function insertAtCursor(snippet: string) {
    const current = valueRef.current;
    const field = textareaRef.current;
    const useCaret = touchedRef.current && field !== null;
    const start = useCaret ? Math.min(field.selectionStart, current.length) : current.length;
    const end = useCaret ? Math.min(field.selectionEnd, current.length) : start;
    pendingCaret.current = start + snippet.length;
    onChange(current.slice(0, start) + snippet + current.slice(end));
  }

  /** 从媒体库插入：按选择顺序拼接（多张各占一行，便于继续手改代码）。 */
  async function insertFromLibrary() {
    if (!pickFromLibrary || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const picked = await pickFromLibrary();
      const parts: string[] = [];
      for (const item of picked) {
        // 先量原图宽高，官网据此预留比例并做响应式/懒加载；量不到就退化为不带宽高。
        let size = "";
        try {
          const dimensions = await measureImage(item.url);
          size = ` width="${dimensions.width}" height="${dimensions.height}"`;
        } catch {
          /* 保留无宽高版本 */
        }
        const alt = escapeAttribute(item.title ?? "");
        parts.push(`<img src="${escapeAttribute(item.url)}" alt="${alt}"${size}>`);
      }
      if (parts.length) insertAtCursor(parts.join("\n"));
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : "插入图片失败，请重试");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-300 overflow-hidden dark:border-gray-700">
      {/* 工具条：双模式与 execCommand 已删除，只留唯一的辅助操作 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">HTML 代码 · 结构以代码为准，版式由站点统一接管</span>
        {pickFromLibrary && (
          <button type="button" title="从媒体库插入图片" disabled={busy} onClick={() => void insertFromLibrary()} className={TOOL_BASE}>
            <ImagePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">从媒体库插入图片</span>
          </button>
        )}
      </div>

      {/* 两栏工作台：≥1024px 并排（代码 / 预览），窄屏自动上下堆叠 */}
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">代码</p>
          <textarea
            ref={textareaRef}
            aria-label="HTML 源码"
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => { touchedRef.current = true; }}
            onSelect={() => { touchedRef.current = true; }}
            className="block h-[260px] w-full resize-y rounded-md border border-gray-200 bg-[#F9FAFB] p-4 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#3E6AE1]/40 lg:h-[480px] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
            style={CODE_FONT}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">预览（已按入库白名单清洗）</p>
          <ArticlePreviewFrame html={value} className="h-[260px] lg:h-[480px]" />
        </div>
      </div>

      {busy && <p role="status" className="px-3 pb-2 text-xs text-gray-500">图片上传中，请稍候…</p>}
      {error && <p role="alert" className="px-3 pb-2 text-xs text-red-600">{error}</p>}

      <p className="border-t border-gray-200 bg-[#F9FAFB] px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
        可直接粘贴完整 HTML，内容与结构以代码为准。允许：p / h1–h6 / ul / ol / li / a / img（含 width、height）/ table / thead / tbody / tr / th / td / strong / em / blockquote / code / pre / figure / figcaption / mark / small / s / del；
        <span className="font-semibold">内联 style 会被清除</span>，版式统一由站点样式接管；script、on* 事件属性与 javascript: 一律移除。右侧预览已按同一份白名单清洗，最终外观以官网为准。
      </p>
    </div>
  );
}
