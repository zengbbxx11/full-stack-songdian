"use client";
import type React from "react";
import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  isOpen,
  onClose,
  children,
  className = "",
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node) &&
      !(event.target as HTMLElement).closest('.dropdown-toggle')
    ) {
      onClose();
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, [onClose]);


  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      // 用 twMerge 合并，让调用方可以用同样粒度的工具类覆盖基类（例如移动端把 absolute 换成 fixed）；
      // 纯字符串拼接时 absolute 与 fixed 谁生效取决于生成的 CSS 顺序，不可控。
      className={twMerge(
        "absolute z-40 right-0 mt-2 rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark",
        className
      )}
    >
      {children}
    </div>
  );
};
