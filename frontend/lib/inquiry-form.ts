import { z } from "zod";

// 与后端 InquirySubmitRequest 及留言业务限制保持一致；数量也占留言长度。
export function inquiryMessage(values: { message: string; quantity?: string }): string {
  return values.quantity ? `[数量需求: ${values.quantity}]\n\n${values.message}` : values.message;
}

export const inquirySchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name (at least 2 characters)").max(50, "Name must be 50 characters or fewer"),
  email: z.string().trim().email("Please enter a valid email address").max(200, "Email must be 200 characters or fewer"),
  productInterest: z.string().min(1, "Please select a product type"),
  message: z.string().trim().min(10, "Please describe your needs (at least 10 characters)"),
  phone: z.string().trim().max(20, "Phone / WhatsApp must be 20 characters or fewer").optional(),
  company: z.string().trim().max(100, "Company name must be 100 characters or fewer").optional(),
  country: z.string().trim().max(100, "Country / region must be 100 characters or fewer").optional(),
  quantity: z.string().trim().optional(),
}).superRefine((values, context) => {
  if (inquiryMessage(values).length > 2000) {
    context.addIssue({ code: "custom", path: ["message"],
      message: "Requirements and order quantity together must be 2,000 characters or fewer" });
  }
});

export type InquiryFormValues = z.infer<typeof inquirySchema>;
