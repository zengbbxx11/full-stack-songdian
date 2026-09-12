import React, { FC } from "react";

interface InputProps {
  type?: "text" | "number" | "email" | "password" | "date" | "time" | string;
  id?: string;
  name?: string;
  autoComplete?: string;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string;
  max?: string;
  maxLength?: number;
  step?: number;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  hint?: string;
  required?: boolean;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  autoComplete,
  placeholder,
  value,
  defaultValue,
  onChange,
  className = "",
  min,
  max,
  maxLength,
  step,
  disabled = false,
  success = false,
  error = false,
  hint,
  required,
}) => {
  const isControlled = value !== undefined;
  // date / time / datetime-local 会渲染浏览器原生日期控件（原生日历图标 + 原生外观），
  // 与后台风格不协调：这里隐藏原生外观、右侧留出内边距，并统一使用自定义日历图标。
  const isDateType = type === "date" || type === "time" || type === "datetime-local";
  const inputRef = React.useRef<HTMLInputElement>(null);
  const spacingClasses = isDateType ? "pl-4 pr-11 py-2.5" : "px-4 py-2.5";
  let inputClasses = `h-11 w-full rounded-lg border appearance-none ${spacingClasses} text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 ${className}`;

  if (disabled) {
    inputClasses += ` text-gray-500 border-gray-300 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700`;
  } else if (error) {
    inputClasses += ` text-error-800 border-error-500 focus:ring-3 focus:ring-error-500/10  dark:text-error-400 dark:border-error-500`;
  } else if (success) {
    inputClasses += ` text-success-500 border-success-400 focus:ring-success-500/10 focus:border-success-300  dark:text-success-400 dark:border-success-500`;
  } else {
    // 日期类控件在部分浏览器下即使 appearance-none 也会绘制内部底色，显式指定以保证与其它输入框一致。
    inputClasses += ` ${isDateType ? "bg-white dark:bg-gray-900" : "bg-transparent"} text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800`;
  }

  // 自定义日历按钮：调用原生 showPicker()，保留"点击图标选择日期时间"的可用性。
  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    const picker = el as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // 部分浏览器要求直接用户手势触发；失败时退化为聚焦（仍可手动输入）。
      }
    }
    el.focus();
  }

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          type={type}
          id={id}
          name={name}
          autoComplete={autoComplete}
          placeholder={placeholder}
          {...(isControlled ? { value } : { defaultValue })}
          onChange={onChange}
          min={min}
          max={max}
          maxLength={maxLength}
          step={step}
          disabled={disabled}
          required={required}
          className={inputClasses}
        />
        {isDateType && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="打开日期时间选择器"
            onClick={openPicker}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
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
        )}
      </div>
      {hint && (
        <p className={`mt-1.5 text-xs ${error ? "text-error-500" : success ? "text-success-500" : "text-gray-500"}`}>
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
