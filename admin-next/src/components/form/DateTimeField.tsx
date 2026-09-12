import React from "react";
import { createPortal } from "react-dom";

interface DateTimeFieldProps {
  id?: string;
  /** 本地时间字符串 `YYYY-MM-DDTHH:mm:ss`（与 publicationTime() 约定一致）。 */
  value?: string;
  /** 与原生 input 兼容的变更回调：`e.target.value` 为 `YYYY-MM-DDTHH:mm:ss` 或空串。 */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

interface Parts {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface PanelPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const PANEL_WIDTH = 288;
const PANEL_ESTIMATED_HEIGHT = 420;

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : min;

/** 解析 `YYYY-MM-DD[T ]HH:mm[:ss]`；非法或空值返回 null。 */
function parseValue(value?: string): Parts | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const parts: Parts = {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
  };
  if (
    parts.month < 0 || parts.month > 11 || parts.day < 1 || parts.day > 31 ||
    parts.hour > 23 || parts.minute > 59 || parts.second > 59
  ) {
    return null;
  }
  return parts;
}

function formatValue(p: Parts, withSeconds = true): string {
  const base = `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  return withSeconds ? `${base}:${pad(p.second)}` : base;
}

/** 展示值：秒为 0 时省略，避免 `:00` 干扰阅读（并与既有 e2e 断言保持一致）。 */
function displayValue(p: Parts | null): string {
  if (!p) return "";
  return p.second === 0 ? formatValue(p, false) : formatValue(p, true);
}

function partsOfNow(): Parts {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: 0,
  };
}

/**
 * 统一风格的日期时间选择器（自绘日历 + 时间）。
 *
 * 为什么不用 `input[type=datetime-local]`：它弹出的日历面板由浏览器/操作系统绘制，
 * 无法用 CSS 与后台风格统一。因此改为「可输入文本框 + 自绘面板」：
 * - 触发器沿用 `InputField` 视觉（同高/同描边/同焦点环/暗色模式），右侧自定义日历图标；
 * - 面板经 Portal 挂到 body，避免被弹窗/表格裁剪，空间不足时自动向上展开；
 * - 支持直接键入 `YYYY-MM-DDTHH:mm:ss`，也支持日历点选日期 + 时/分/秒微调；
 * - 对外保持 `id` + `value` + `onChange(e.target.value)` 语义，调用方与既有测试无需改动。
 */
export default function DateTimeField({
  id,
  value,
  onChange,
  placeholder = "yyyy-mm-ddThh:mm:ss",
  disabled,
  className = "",
  ...rest
}: DateTimeFieldProps) {
  const parsed = React.useMemo(() => parseValue(value), [value]);
  const fallback = React.useMemo(() => partsOfNow(), []);

  const [draft, setDraft] = React.useState(() => displayValue(parsed));
  const [timeDraft, setTimeDraft] = React.useState(() => ({
    hour: pad((parsed ?? fallback).hour),
    minute: pad((parsed ?? fallback).minute),
    second: pad((parsed ?? fallback).second),
  }));
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState((parsed ?? fallback).year);
  const [viewMonth, setViewMonth] = React.useState((parsed ?? fallback).month);
  const [pos, setPos] = React.useState<PanelPos | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastEmitted = React.useRef<string | null>(null);

  // 外部值变化时同步展示（自身 emit 引起的回传不覆盖用户正在输入的内容）。
  React.useEffect(() => {
    if (value === lastEmitted.current) return;
    const p = parseValue(value);
    setDraft(displayValue(p));
    setTimeDraft({
      hour: pad((p ?? fallback).hour),
      minute: pad((p ?? fallback).minute),
      second: pad(p ? p.second : fallback.second),
    });
  }, [value, fallback]);

  function dispatch(next: string) {
    lastEmitted.current = next;
    onChange?.({
      target: { value: next },
      currentTarget: { value: next },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  }

  /** 程序化修改（点选日期/时间/今天/清除）：同步刷新文本框与时间草稿。 */
  function emit(next: string) {
    const p = parseValue(next);
    setDraft(displayValue(p));
    if (p) {
      setTimeDraft({ hour: pad(p.hour), minute: pad(p.minute), second: pad(p.second) });
    }
    dispatch(next);
  }

  /** 用当前时间草稿 + 指定日期组装完整值。 */
  function composeWithDate(base: Parts): string {
    return formatValue(
      {
        ...base,
        hour: clamp(Number(timeDraft.hour), 0, 23),
        minute: clamp(Number(timeDraft.minute), 0, 59),
        second: clamp(Number(timeDraft.second), 0, 59),
      },
      true,
    );
  }

  function openPanel() {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const placeAbove = spaceBelow < PANEL_ESTIMATED_HEIGHT && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, PANEL_WIDTH);
    const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - width - 8, 8));
    setPos(
      placeAbove
        ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: spaceAbove }
        : { left, width, top: rect.bottom + 4, maxHeight: spaceBelow },
    );
    const p = parseValue(value);
    setViewYear((p ?? fallback).year);
    setViewMonth((p ?? fallback).month);
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
  }

  // 面板渲染后按**实测高度**校正位置：仅在下方确实放不下且上方更宽裕时才向上展开。
  React.useLayoutEffect(() => {
    if (!open) return;
    const el = inputRef.current;
    const panelEl = panelRef.current;
    if (!el || !panelEl) return;
    const rect = el.getBoundingClientRect();
    const height = panelEl.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const placeAbove = spaceBelow < height && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, PANEL_WIDTH);
    const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - width - 8, 8));
    setPos(
      placeAbove
        ? { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight: spaceAbove }
        : { left, width, top: rect.bottom + 4, maxHeight: spaceBelow },
    );
  }, [open, viewYear, viewMonth]);

  // 打开时：点击外部 / 滚动 / 尺寸变化即关闭，避免浮层与触发器错位。
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onViewportChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  // 键入：合法则实时上报；清空则上报空串；非法输入保留草稿待 blur 兜底回滚。
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    if (raw.trim() === "") {
      dispatch("");
      return;
    }
    const p = parseValue(raw);
    if (p) dispatch(formatValue(p, true));
  }

  function onInputBlur() {
    setDraft(displayValue(parseValue(value)));
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      openPanel();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closePanel();
    }
  }

  const cells = React.useMemo(() => {
    const startOffset = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    const out: { y: number; m: number; d: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const index = i - startOffset;
      if (index < 0) {
        out.push({
          y: viewMonth === 0 ? viewYear - 1 : viewYear,
          m: viewMonth === 0 ? 11 : viewMonth - 1,
          d: prevMonthDays + index + 1,
          inMonth: false,
        });
      } else if (index >= daysInMonth) {
        out.push({
          y: viewMonth === 11 ? viewYear + 1 : viewYear,
          m: viewMonth === 11 ? 0 : viewMonth + 1,
          d: index - daysInMonth + 1,
          inMonth: false,
        });
      } else {
        out.push({ y: viewYear, m: viewMonth, d: index + 1, inMonth: true });
      }
    }
    return out;
  }, [viewYear, viewMonth]);

  function pickDay(cell: { y: number; m: number; d: number; inMonth: boolean }) {
    const base = parsed ?? fallback;
    emit(composeWithDate({ ...base, year: cell.y, month: cell.m, day: cell.d }));
    if (!cell.inMonth) {
      setViewYear(cell.y);
      setViewMonth(cell.m);
    }
  }

  const timeFields = [
    { kind: "hour" as const, label: "时" },
    { kind: "minute" as const, label: "分" },
    { kind: "second" as const, label: "秒" },
  ];

  function onTimeChange(kind: "hour" | "minute" | "second", raw: string) {
    const digits = raw.replace(/[^\d]/g, "").slice(0, 2);
    const next = { ...timeDraft, [kind]: digits };
    setTimeDraft(next);
    const max = kind === "hour" ? 23 : 59;
    if (digits === "" || Number(digits) > max) return;
    const base = parsed ?? fallback;
    emit(composeWithDate({ ...base, hour: clamp(Number(next.hour), 0, 23), minute: clamp(Number(next.minute), 0, 59), second: clamp(Number(next.second), 0, 59) }));
  }

  function onTimeBlur(kind: "hour" | "minute" | "second") {
    const max = kind === "hour" ? 23 : 59;
    const current = timeDraft[kind];
    const num = current === "" ? (parsed ?? fallback)[kind] : clamp(Number(current), 0, max);
    setTimeDraft((prev) => ({ ...prev, [kind]: pad(num) }));
    const base = parsed ?? fallback;
    emit(composeWithDate({ ...base, [kind]: num }));
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="选择日期时间"
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
              zIndex: 80,
            }}
            className="custom-scrollbar overflow-auto rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {/* 月份切换 */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="上一个月"
                onClick={() => shiftMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                {viewYear} 年 {viewMonth + 1} 月
              </span>
              <button
                type="button"
                aria-label="下一个月"
                onClick={() => shiftMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* 星期表头 */}
            <div className="mb-1 grid grid-cols-7 text-center text-xs text-gray-400 dark:text-gray-500">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1">{w}</span>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((cell, index) => {
                const selected =
                  parsed != null &&
                  parsed.year === cell.y &&
                  parsed.month === cell.m &&
                  parsed.day === cell.d;
                const isToday =
                  fallback.year === cell.y &&
                  fallback.month === cell.m &&
                  fallback.day === cell.d;
                return (
                  <button
                    key={`${cell.y}-${cell.m}-${cell.d}-${index}`}
                    type="button"
                    aria-label={`${cell.y}-${pad(cell.m + 1)}-${pad(cell.d)}`}
                    aria-pressed={selected}
                    onClick={() => pickDay(cell)}
                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
                      selected
                        ? "bg-brand-500 font-medium text-white hover:bg-brand-600"
                        : isToday
                          ? "font-medium text-brand-500 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/[0.12]"
                          : cell.inMonth
                            ? "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                            : "text-gray-300 hover:bg-gray-50 dark:text-gray-600 dark:hover:bg-gray-800/60"
                    }`}
                  >
                    {cell.d}
                  </button>
                );
              })}
            </div>

            {/* 时间微调 */}
            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">时间</span>
              {timeFields.map(({ kind, label }, index) => (
                <React.Fragment key={kind}>
                  {index > 0 && <span className="text-gray-400">:</span>}
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={label}
                    placeholder={kind === "hour" ? "hh" : "mm"}
                    value={timeDraft[kind]}
                    disabled={disabled}
                    onChange={(e) => onTimeChange(kind, e.target.value)}
                    onBlur={() => onTimeBlur(kind)}
                    className="h-9 w-12 appearance-none rounded-lg border border-gray-300 bg-white text-center text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                </React.Fragment>
              ))}
              <span className="ml-auto text-xs text-gray-400">24 小时制</span>
            </div>

            {/* 快捷操作 */}
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => emit(composeWithDate(fallback))}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-500 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/[0.12]"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={() => emit("")}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  清除
                </button>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
              >
                确定
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative w-full">
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={onInputChange}
        onBlur={onInputBlur}
        onKeyDown={onInputKeyDown}
        className={`h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-4 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:bg-gray-800 dark:disabled:text-gray-400 dark:focus:border-brand-800 ${className}`}
      />
      <button
        type="button"
        aria-label="打开日期时间日历"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed dark:hover:text-gray-300"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {panel}
    </div>
  );
}
