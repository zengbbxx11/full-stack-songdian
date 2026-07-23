"use server";

/**
 * 询盘提交服务 — 服务端 action
 * ------------------------------------------------------------------
 * 将客户询盘数据持久化到 data/inquiries.json，并可选通过
 * SMTP（nodemailer）发送邮件通知。即使邮件发送失败，
 * 文件写入始终保证数据不丢失。
 *
 * 使用方式（客户端组件中直接调用）：
 *   import { submitInquiry } from "@/lib/inquiry-service";
 *   const result = await submitInquiry({ fullName: "...", email: "...", ... });
 */

import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";

// ============================================================
// 类型定义
// ============================================================

export interface InquiryInput {
  fullName: string;
  email: string;
  productInterest: string;
  message: string;
  phone?: string | null;
  company?: string | null;
  quantity?: string | null;
}

export interface InquiryRecord extends InquiryInput {
  id: string;
  timestamp: string;
}

export interface SubmitResult {
  success: boolean;
  id: string;
  emailSent: boolean;
}

// ============================================================
// 存储路径
// ============================================================

const DATA_DIR = path.join(process.cwd(), "data");
const INQUIRIES_FILE = path.join(DATA_DIR, "inquiries.json");

// ============================================================
// 文件持久化
// ============================================================

/**
 * 将单条询盘追加到 data/inquiries.json。
 * 文件不存在时自动创建目录和空数组。
 */
async function appendInquiryToFile(record: InquiryRecord): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  let inquiries: InquiryRecord[] = [];
  try {
    const raw = await readFile(INQUIRIES_FILE, "utf-8");
    inquiries = JSON.parse(raw);
  } catch {
    // 文件不存在或损坏 → 从头开始
  }

  inquiries.push(record);
  await writeFile(INQUIRIES_FILE, JSON.stringify(inquiries, null, 2), "utf-8");
}

// ============================================================
// 工具函数
// ============================================================

/** 转义 HTML 特殊字符，防止邮件模板中 XSS */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================
// 邮件发送（可选，需要配置 SMTP 环境变量）
// ============================================================

/**
 * 尝试通过 nodemailer 发送询盘通知邮件。
 * SMTP 未配置或发送失败时静默跳过，不阻塞主流程。
 */
async function trySendEmail(record: InquiryRecord): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const recipient = process.env.INQUIRY_EMAIL_TO || "zengxb21@proton.me";
  const from = process.env.INQUIRY_EMAIL_FROM || smtpUser || "noreply@songdian.com";

  // SMTP 未配置 → 跳过邮件发送，但不影响文件保存
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log("[inquiry] SMTP 未配置，跳过邮件发送。询盘已保存至文件。");
    return false;
  }

  try {
    // 动态导入 nodemailer（仅服务端可用）
    const nodemailer = await import("nodemailer");

    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: Number(smtpPort) || 587,
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // 产品类型中文映射
    const categoryLabels: Record<string, string> = {
      "compact-digital-cameras": "Compact Cameras",
      "mirrorless-cameras": "Mirrorless Cameras",
      "action-cameras": "Action Cameras",
      "kids-cameras": "Kids Cameras",
      "video-cameras-camcorders": "Video / Camcorders",
      "custom-oem-odm-project": "Custom OEM/ODM Project",
    };

    const catName = categoryLabels[record.productInterest] || record.productInterest;
    const e = (s: string) => escapeHtml(s);

    const htmlBody = `
      <h2>New Inquiry — Songdian Technology</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:140px;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(record.fullName)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;"><a href="mailto:${e(record.email)}">${e(record.email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Product Interest</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(catName)}</td></tr>
        ${record.company ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Company</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(record.company)}</td></tr>` : ""}
        ${record.phone ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Phone</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(record.phone)}</td></tr>` : ""}
        ${record.quantity ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Est. Quantity</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(record.quantity)}</td></tr>` : ""}
        <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Message</td><td style="padding:8px;border-bottom:1px solid #eee;">${e(record.message).replace(/\n/g, "<br>")}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;">Submitted</td><td style="padding:8px;">${new Date(record.timestamp).toLocaleString("en-US", { timeZone: "Asia/Shanghai" })} (GMT+8)</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px;">Inquiry ID: ${record.id} — Songdian Technology B2B Website</p>
    `;

    await transporter.sendMail({
      from: `"Songdian Inquiry" <${from}>`,
      to: recipient,
      subject: `[Inquiry] ${e(record.fullName)} — ${e(catName)}`,
      html: htmlBody,
    });

    console.log(`[inquiry] 邮件已发送至 ${recipient}`);
    return true;
  } catch (err) {
    console.error("[inquiry] 邮件发送失败:", err);
    return false;
  }
}

// ============================================================
// 公开的提交入口
// ============================================================

/**
 * 提交客户询盘。
 * 数据始终保存到 data/inquiries.json；若已配置 SMTP 则同步发送邮件。
 *
 * @returns {SubmitResult} 包含提交状态、记录 ID 和邮件是否已发送的标志
 */
export async function submitInquiry(data: InquiryInput): Promise<SubmitResult> {
  const id = `INQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: InquiryRecord = {
    ...data,
    id,
    timestamp: new Date().toISOString(),
  };

  // 1. 持久化到文件（始终执行，不因邮件失败而丢数据）
  await appendInquiryToFile(record);

  // 2. 尝试发送邮件（可选）
  const emailSent = await trySendEmail(record);

  return { success: true, id, emailSent };
}
