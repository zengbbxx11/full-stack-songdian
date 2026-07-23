"use client";

import { Controller, type Control, type FieldError, type FieldPath, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * FormSelect — 基于 react-hook-form + shadcn Select 的下拉字段
 * ------------------------------------------------------------------
 * 客户端组件。通过 Controller 接管 shadcn Select 的受控状态，适用于需要校验的下拉选项。
 */

interface FormSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
  label: string;
  control: Control<TFieldValues>;
  error?: FieldError;
  options: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
}

export default function FormSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  label,
  control,
  error,
  options,
  placeholder = "Select...",
  required = false,
}: FormSelectProps<TFieldValues, TName>) {
  const hasError = Boolean(error);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-[#3E6AE1] ml-0.5">*</span>}
      </Label>

      <Controller<TFieldValues, TName>
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ""}
            onValueChange={field.onChange}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                hasError && "border-[#3E6AE1] focus-visible:border-[#3E6AE1] focus-visible:ring-[#3E6AE1]/20"
              )}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {hasError && (
        <p className="text-sm" style={{ color: "#3E6AE1" }}>{error?.message}</p>
      )}
    </div>
  );
}
