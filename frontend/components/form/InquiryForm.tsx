"use client";

/**
 * 询盘表单（完整版，components/form 目录）
 * ------------------------------------------------------------------
 * 客户端组件。基于 react-hook-form + zod 校验 + next-safe-form 提交。
 *
 * 设计目标：降低客户填表成本、提升填表欲望。
 *  - 仅 4 项必填（姓名 / 邮箱 / 产品类型 / 需求），其余设为可选并折叠收起；
 *  - 产品类型改为可一键点选的「胶囊按钮」，比下拉框更快、更有交互感；
 *  - 表单头部加信任背书条（24h 回复 · 免费报价 · 服务 60+ 国家），降低提交心理门槛；
 *  - CTA 文案由 "Submit" 改为利益导向的 "Get My Free Quote"；
 *  - 提交成功改为页面内成功态，替代原生 alert。
 */

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormField from "./FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, Clock, BadgeCheck, Globe, Check } from "lucide-react";
import { submitInquiry } from "@/lib/inquiry-service";

const cameraCategories = [
  { label: "Compact Cameras", value: "compact-digital-cameras" },
  { label: "Mirrorless Cameras", value: "mirrorless-cameras" },
  { label: "Action Cameras", value: "action-cameras" },
  { label: "Kids Cameras", value: "kids-cameras" },
  { label: "Video / Camcorders", value: "video-cameras-camcorders" },
  { label: "Custom OEM/ODM", value: "custom-oem-odm-project" },
];

// zod 校验规则：仅核心 4 项必填，其余可选，最大程度降低填写负担
const inquirySchema = z.object({
  fullName: z.string().min(2, "Please enter your name (at least 2 characters)"),
  email: z.string().email("Please enter a valid email address"),
  productInterest: z.string().min(1, "Please select a product type"),
  message: z.string().min(10, "Please describe your needs (at least 10 characters)"),
  phone: z.string().optional(),
  company: z.string().optional(),
  quantity: z.string().optional(),
});

type InquiryFormValues = z.infer<typeof inquirySchema>;

const TRUST_ITEMS = [
  { icon: Clock, text: "Reply within 24h" },
  { icon: BadgeCheck, text: "Free, no-obligation quote" },
  { icon: Globe, text: "Trusted in 60+ countries" },
];

export default function InquiryForm() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InquiryFormValues>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      fullName: "",
      email: "",
      productInterest: "",
      message: "",
      phone: "",
      company: "",
      quantity: "",
    },
  });

  // 提交处理：调用服务端 action 保存询盘并发送邮件通知
  const onSubmit = async (values: InquiryFormValues) => {
    const result = await submitInquiry({
      fullName: values.fullName,
      email: values.email,
      productInterest: values.productInterest,
      message: values.message,
      phone: values.phone || null,
      company: values.company || null,
      quantity: values.quantity || null,
    });
    if (result.success) {
      setSubmitted(true);
      reset();
    }
  };

  // 提交成功后的内联成功态（替代原生 alert，体验更顺滑）
  if (submitted) {
    return (
      <Card className="w-full border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
        <CardContent className="py-12 md:py-16 text-center px-6">
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#EFF3FF" }}
          >
            <Check className="w-8 h-8" style={{ color: "#3E6AE1" }} strokeWidth={2.5} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Thank you — we&apos;ve got it!</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Your inquiry is on its way to our team. Expect a tailored quote in your inbox within 24 hours.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSubmitted(false)}
            className="mt-6"
            style={{ borderRadius: "4px" }}
          >
            Send another inquiry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card className="w-full border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-900">Send an Inquiry</CardTitle>
          <CardDescription className="text-sm text-gray-500">
            Tell us about your project — get a tailored quote within 24 hours. No commitment, just answers.
          </CardDescription>

          {/* 信任背书条：降低提交心理门槛，提升填表欲望 */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {TRUST_ITEMS.map((item) => (
              <div key={item.text} className="flex items-center gap-1.5 text-xs text-gray-500">
                <item.icon className="w-4 h-4 shrink-0" style={{ color: "#3E6AE1" }} aria-hidden="true" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-5">
            {/* 产品类型：一键点选胶囊，比下拉框更快更有交互感（必填） */}
            <Controller
              control={control}
              name="productInterest"
              render={({ field, fieldState }) => (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-700">
                    What are you looking for? <span style={{ color: "#3E6AE1" }}>*</span>
                  </span>
                  <div role="radiogroup" className="flex flex-wrap gap-2">
                    {cameraCategories.map((cat) => {
                      const active = field.value === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => field.onChange(cat.value)}
                          className={cn(
                            "px-3.5 py-2 text-sm rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3E6AE1]/30",
                            active
                              ? "border-[#d4343e] bg-[#fdeced] text-[#d4343e] font-medium"
                              : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                          )}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                  {fieldState.error && (
                    <p className="text-sm" style={{ color: "#3E6AE1" }}>{fieldState.error.message}</p>
                  )}
                </div>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                label="Full Name"
                type="text"
                placeholder="John Smith"
                required
                registration={register("fullName")}
                error={errors.fullName}
              />
              <FormField
                label="Email"
                type="email"
                placeholder="john@company.com"
                required
                registration={register("email")}
                error={errors.email}
              />
            </div>

            <FormField
              label="Your Requirements"
              type="textarea"
              placeholder="e.g. We're launching a 4K action camera line for the EU market — need ODM support on design, certification (CE/FCC) and packaging. Target MOQ 1,000 units."
              rows={5}
              required
              registration={register("message")}
              error={errors.message}
            />

            {/* 可选信息折叠：核心表单保持简短，降低「看起来很长」的心理负担 */}
            <details className="group rounded-md border border-dashed border-gray-200 px-4 py-3">
              <summary className="text-sm font-medium text-gray-600 cursor-pointer select-none list-none flex items-center justify-between">
                <span>Add more details (optional)</span>
                <span className="text-gray-400 text-xs group-open:hidden">Show</span>
                <span className="text-gray-400 text-xs hidden group-open:inline">Hide</span>
              </summary>
              <div className="pt-4 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    label="Phone / WhatsApp"
                    type="tel"
                    placeholder="+1 234 567 8900"
                    registration={register("phone")}
                    error={errors.phone}
                  />
                  <FormField
                    label="Company Name"
                    type="text"
                    placeholder="Your Company Inc."
                    registration={register("company")}
                    error={errors.company}
                  />
                </div>
                <FormField
                  label="Estimated Order Quantity"
                  type="text"
                  placeholder="e.g. 500 units"
                  registration={register("quantity")}
                  error={errors.quantity}
                />
              </div>
            </details>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-8 py-3 text-sm font-semibold transition-colors duration-[330ms] bg-[#3E6AE1] hover:bg-[#3561CC] text-white"
                style={{ borderRadius: "4px" }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Get My Free Quote"
                )}
              </Button>
              <p className="text-xs text-gray-400 mt-3">
                We respect your privacy. Your details are only used to prepare your quote.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
