"use client";

/*
 * 文件：components/NavigationProgress.tsx
 * 职责：顶部路由切换进度条 —— 用户点击链接瞬间触发，新页面到达后完成。
 *
 * 原理：
 *   1. 全局监听 <a> 点击事件 → 立刻显示进度条（0→80% 缓慢推进）
 *   2. usePathname() 变化 → 新页面已到达，进度条冲到 100% 后淡出
 *
 * 零依赖，纯 React + CSS transition。
 * 弱网价值：点击即反馈，不等服务器响应。
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const prevPath = useRef(pathname);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 清理辅助 ──────────────────────────────────────────────
  function clearTimers() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (hideRef.current) { clearTimeout(hideRef.current); hideRef.current = null; }
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  }

  // ── 1. 拦截 <a> 点击 → 立刻启动进度条 ──────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // 只处理未被阻止的左键点击
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;

      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // 排除外部链接、锚点、邮件、电话
      if (/^(https?:|mailto:|tel:|#)/.test(href)) return;

      // 解析为目标路径，与当前路径比较
      let targetPath: string;
      try {
        const url = new URL(href, window.location.origin);
        targetPath = url.pathname + url.search;
      } catch {
        return;
      }

      // 同页不触发
      if (targetPath === pathname + window.location.search) return;

      // ── 启动进度条 ──
      clearTimers();
      setVisible(true);
      setProgress(8);

      // 缓慢推进到 80%（模拟加载感，不提前到顶）
      let p = 8;
      tickRef.current = setInterval(() => {
        p = Math.min(p + Math.random() * 12, 80);
        setProgress(p);
      }, 250);

      // 安全兜底：8 秒后无论如何完成（防卡死）
      safetyRef.current = setTimeout(() => {
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        setProgress(100);
        hideRef.current = setTimeout(() => { setVisible(false); setProgress(0); }, 300);
      }, 8000);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // ── 2. pathname 变化 → 新页面到达，冲到 100% 并淡出 ─────────
  useEffect(() => {
    if (prevPath.current === pathname) return;

    prevPath.current = pathname;
    clearTimers();

    setProgress(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 350);

    return clearTimers;
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none">
      <div
        className="h-full bg-[#d4343e] transition-[width,opacity] duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          boxShadow: "0 0 8px rgba(212, 52, 62, 0.5)",
        }}
      />
    </div>
  );
}
