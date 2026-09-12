import React from "react";
import { createPortal } from "react-dom";

interface SelectFieldProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "value" | "onChange" | "children" | "className" | "type"
  > {
  /** 当前值（与原生 select 一致，可为字符串或数字）。 */
  value?: string | number;
  /** 与原生 select 兼容的变更回调：`e.target.value` 为选中的字符串值。 */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  /** 选项，写法与原生 `<select>` 相同：`<option value="x">标签</option>`。 */
  children?: React.ReactNode;
  /** 外部布局类（如宽度），作用于触发器按钮。 */
  className?: string;
  /** md：与 InputField 等高（h-11），用于表单；sm：紧凑工具栏（h-9）。 */
  selectSize?: "md" | "sm";
  required?: boolean;
}

interface OptionItem {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
}

/** 递归提取选项的可读文本，用于 type-ahead 与占位判断。 */
function toText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (React.isValidElement(node)) {
    return toText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

/** 把 `<option>` 子节点解析为选项列表（支持 `{arr.map(...)}` 等嵌套写法）。 */
function parseOptions(children: React.ReactNode): OptionItem[] {
  const out: OptionItem[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.type !== "option") return;
    const props = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
    };
    out.push({
      value: props.value === undefined ? "" : String(props.value),
      label: props.children,
      text: toText(props.children),
      disabled: Boolean(props.disabled),
    });
  });
  return out;
}

const MENU_MAX_HEIGHT = 264;

/**
 * 统一风格的下拉选择（自绘 listbox）。
 *
 * 为什么不用原生 `<select>`：合上时的边框/箭头可以靠 CSS 统一，但**展开后的选项面板
 * 完全由操作系统绘制**（系统字体、系统高亮色），无法与后台风格保持一致。因此这里改为
 * 「按钮 + Portal 弹出列表」的自绘实现：
 * - 视觉与 `InputField` 同源（圆角/描边/高度/焦点环/暗色模式）；
 * - 列表用 Portal 挂到 body，避免被表格 `overflow` 或弹窗裁剪，并自动上下翻转；
 * - 完整键盘支持（↑/↓/Home/End/Enter/Space/Esc/Tab）与 ARIA listbox 语义；
 * - 对外 props 与原生 `<select>` 兼容（value / onChange / option 子节点），调用方无需改动。
 */
export default function SelectField({
  value,
  onChange,
  children,
  className = "",
  selectSize = "md",
  required,
  disabled,
  id,
  ...rest
}: SelectFieldProps) {
  const options = React.useMemo(() => parseOptions(children), [children]);
  const currentValue = value === undefined || value === null ? "" : String(value);
  const selectedIndex = options.findIndex((o) => o.value === currentValue);

  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(selectedIndex);
  const [menuPos, setMenuPos] = React.useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLUListElement>(null);
  const menuId = React.useId();

  const wrapperClasses = selectSize === "sm" ? "relative inline-block" : "relative w-full";
  const sizeClasses =
    selectSize === "sm" ? "h-9 pl-3 pr-2.5 text-xs" : "h-11 w-full pl-4 pr-3.5 py-2.5 text-sm";

  const isPlaceholder = currentValue === "" || selectedIndex < 0;
  const displayLabel = selectedIndex >= 0 ? options[selectedIndex].label : options[0]?.label ?? "";

  function openMenu(direction?: 1 | -1) {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    // 下方空间不足且上方更宽裕时向上弹出。
    const placeAbove = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
    setMenuPos(
      placeAbove
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4, maxHeight }
        : { left: rect.left, width: rect.width, top: rect.bottom + 4, maxHeight },
    );
    setHighlight(selectedIndex >= 0 ? selectedIndex : direction === -1 ? Math.max(options.length - 1, 0) : 0);
    setOpen(true);
  }

  function closeMenu(refocus = false) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function commit(opt: OptionItem) {
    if (opt.disabled) return;
    // 兼容原生 select 的 onChange 签名，调用方无需改动。
    onChange?.({
      target: { value: opt.value },
      currentTarget: { value: opt.value },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
    closeMenu(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu(e.key === "ArrowUp" ? -1 : 1);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu();
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const opt = options[highlight];
        if (opt) commit(opt);
        break;
      }
      case "ArrowDown":
        e.preventDefault();
        setHighlight((i) => (options.length ? (i + 1) % options.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((i) => (options.length ? (i - 1 + options.length) % options.length : 0));
        break;
      case "Home":
        e.preventDefault();
        setHighlight(0);
        break;
      case "End":
        e.preventDefault();
        setHighlight(Math.max(options.length - 1, 0));
        break;
      default:
        break;
    }
  }

  // 打开时：点击外部 / 滚动 / 尺寸变化即关闭，避免浮层与触发器错位。
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
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

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label={rest["aria-label"] ? `${rest["aria-label"]} options` : "options"}
            style={{
              position: "fixed",
              left: menuPos.left,
              width: menuPos.width,
              top: menuPos.top,
              bottom: menuPos.bottom,
              maxHeight: menuPos.maxHeight,
              zIndex: 90,
            }}
            className="custom-scrollbar overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-theme-md dark:border-gray-700 dark:bg-gray-900"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">无可选项</li>
            ) : (
              options.map((opt, index) => {
                const selected = opt.value === currentValue && selectedIndex >= 0;
                return (
                  <li
                    key={`${opt.value}-${index}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseEnter={() => !opt.disabled && setHighlight(index)}
                    // 阻止按钮失焦/列表因 mousedown 提前关闭。
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(opt)}
                    className={`mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                      opt.disabled
                        ? "cursor-not-allowed text-gray-400 dark:text-gray-600"
                        : index === highlight
                          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400"
                          : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {selected && (
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={wrapperClasses}>
      <button
        {...rest}
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        data-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        data-value={currentValue}
        onClick={() => (open ? closeMenu(true) : openMenu(1))}
        onKeyDown={onKeyDown}
        className={`flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white text-left shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-gray-800 dark:disabled:text-gray-400 dark:focus:border-brand-800 ${sizeClasses} ${className}`}
      >
        <span className={`truncate ${isPlaceholder ? "text-gray-400 dark:text-gray-500" : ""}`}>
          {displayLabel}
        </span>
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
          className={`shrink-0 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
