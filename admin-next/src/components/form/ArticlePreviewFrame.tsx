/*
 * 组件：ArticlePreviewFrame — 文章正文的沙箱预览
 * ------------------------------------------------------------------
 * 安全口径（重要）：预览渲染在 <iframe sandbox="">（无 allow-scripts、无 allow-same-origin）
 * 里 —— 独立不透明源，脚本无法执行、也无法访问后台页面的 DOM 与管理员会话。
 * 这是本次改造的**强制安全边界**；清洗（lib/article-html.ts）只负责让预览"看起来像官网"，
 * 不作为防线。因此本组件内**不出现 dangerouslySetInnerHTML**：整篇文档只经 srcDoc 进入沙箱。
 *
 * 性能：输入 → useDeferredValue → 150ms 防抖 → 动态 import 清洗器（sanitize-html 不进
 * 表单首屏 bundle）→ 更新 srcDoc。长正文连打时不会每个按键都重建预览文档。
 * 已知限制：每次更新都是整篇 srcDoc 重载，因此预览内的滚动位置会回到顶部、图片会重新加载；
 * 150ms 防抖已把频率降到"停顿后一次"。若日后要消除闪烁，可在清洗结果未变化时跳过 setDoc。
 */
"use client";

import React, { useDeferredValue, useEffect, useState } from "react";

export default function ArticlePreviewFrame({ html, className = "" }: { html: string; className?: string }) {
  const deferredHtml = useDeferredValue(html);
  const [doc, setDoc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void import("@/lib/article-html")
        .then(({ buildPreviewDocument }) => {
          if (!cancelled) {
            setDoc(buildPreviewDocument(deferredHtml, window.location.origin));
            setFailed(false);
          }
        })
        .catch((previewError) => {
          // 清洗器加载失败：给运营一句可见的提示，而不是只留控制台报错（保存链路不受影响）
          console.error(previewError);
          if (!cancelled) setFailed(true);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredHtml]);

  return (
    <>
      <iframe
        title="正文预览"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={doc}
        className={`block w-full rounded-md border border-gray-200 bg-white dark:border-gray-700 ${className}`}
      />
      {failed && (
        <p role="status" className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          预览组件加载失败，请刷新页面重试；内容编辑与保存不受影响。
        </p>
      )}
    </>
  );
}
