"use client";

import type { FieldError, UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * FormField — 基于 react-hook-form 的通用表单字段
 * ------------------------------------------------------------------
 * 客户端组件。封装 Label + Input/Textarea + 错误信息，受控于 react-hook-form 的 registration。
 * 校验错误时使用品牌红 #3E6AE1 高亮边框与提示文字。
 */

interface FormFieldProps {
  label: string;
  error?: FieldError;
  type?: "text" | "email" | "tel" | "textarea";
  placeholder?: string;
  required?: boolean;
  className?: string;
  rows?: number;
  registration: UseFormRegisterReturn;
}

export default function FormField({
  label,
  error,
  type = "text",
  placeholder,
  required = false,
  className,
  rows = 4,
  registration,
}: FormFieldProps) {
  const hasError = Boolean(error);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={registration.name} className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-[#3E6AE1] ml-0.5">*</span>}
      </Label>

      {type === "textarea" ? (
        <Textarea
          id={registration.name}
          {...registration}
          rows={rows}
          placeholder={placeholder}
          className={cn(
            hasError && "border-[#3E6AE1] focus-visible:border-[#3E6AE1] focus-visible:ring-[#3E6AE1]/20"
          )}
        />
      ) : (
        <Input
          id={registration.name}
          type={type}
          {...registration}
          placeholder={placeholder}
          className={cn(
            hasError && "border-[#3E6AE1] focus-visible:border-[#3E6AE1] focus-visible:ring-[#3E6AE1]/20"
          )}
        />
      )}

      {hasError && (
        <p className="text-sm" style={{ color: "#3E6AE1" }}>{error?.message}</p>
      )}
    </div>
  );
}
