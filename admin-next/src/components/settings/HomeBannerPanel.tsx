"use client";
/*
 * 首页轮播面板：管理官网首页 3 张轮播图（图片 / 启用 / 跳转链接）。
 *
 * 数据存于设置 KV `home_banners`（JSON 数组字符串，固定 3 槽），随公开设置接口下发官网。
 * 与设置页其它键的「差量保存」互不干扰：面板维护自己的草稿，保存时单独 PUT `home_banners`。
 * 页面以 `key={服务端值}` 挂载本组件 —— 服务端值变化（保存/重新读取）时整体重置为最新值，
 * 不用 useEffect 同步 setState。
 *
 * 图片选择复用媒体库选择器（单选、仅图片）；选择器内上传未指定相册时进入「未分类」。
 */
import { useRef, useState } from "react";

import MediaPicker from "@/components/media/MediaPicker";
import MediaThumb from "@/components/media/MediaThumb";
import type { PickedMedia } from "@/components/media/types";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/api-client";

/** 单个轮播槽位（与官网 parseHomeBanners 消费的形态一致）。 */
interface BannerSlot {
  url: string;
  /** 移动端专用竖版图（可选）：配置后手机端只加载这张（art direction） */
  mobileUrl: string;
  enabled: boolean;
  href: string;
}

const EMPTY_SLOT: BannerSlot = { url: "", mobileUrl: "", enabled: false, href: "" };

/** 防御式解析已存值：缺槽/畸形数据一律补空槽，保证面板始终有固定 3 行可编辑。 */
function parseSlots(value: string | undefined): BannerSlot[] {
  const slots: BannerSlot[] = [];
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, 3)) {
        if (!item || typeof item !== "object") continue;
        const record = item as { url?: unknown; mobileUrl?: unknown; enabled?: unknown; href?: unknown };
        slots.push({
          url: typeof record.url === "string" ? record.url : "",
          mobileUrl: typeof record.mobileUrl === "string" ? record.mobileUrl : "",
          enabled: record.enabled === true,
          href: typeof record.href === "string" ? record.href : "",
        });
      }
    }
  } catch {
    // 保留已解析出的槽位，剩余补空
  }
  while (slots.length < 3) slots.push({ ...EMPTY_SLOT });
  return slots;
}

/** 链接只允许站内绝对路径或 http(s)，拒绝协议相对外链（"//x"、"/\\x"），与官网侧解析规则一致。 */
function isSafeHref(href: string): boolean {
  if (href === "") return true;
  if (href.startsWith("//") || href.startsWith("/\\")) return false;
  return href.startsWith("/") || /^https?:\/\//i.test(href);
}

interface HomeBannerPanelProps {
  /** 服务端存储的 home_banners 原始 JSON 字符串（页面以 key=该值 控制重置） */
  value: string;
  /** 保存成功后由页面重新读取设置（mutate） */
  onSaved: () => void;
}

export default function HomeBannerPanel({ value, onSaved }: HomeBannerPanelProps) {
  const toast = useToast();
  const [slots, setSlots] = useState<BannerSlot[]>(() => parseSlots(value));
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ index: number; variant: "desktop" | "mobile" } | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const inFlight = useRef(false);

  function updateSlot(index: number, patch: Partial<BannerSlot>) {
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function confirmPick(target: { index: number; variant: "desktop" | "mobile" }, picked: PickedMedia[]) {
    const first = picked[0];
    if (first) {
      updateSlot(target.index, target.variant === "mobile" ? { mobileUrl: first.url } : { url: first.url, enabled: true });
    }
    setPickerFor(null);
  }

  async function handleSave() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      // 第 1 槽是首屏主图：始终参与展示（留空即官网默认 Banner），不存链接
      const payload = slots.map((slot, index) => ({
        url: slot.url,
        mobileUrl: slot.mobileUrl,
        enabled: index === 0 ? true : slot.enabled,
        href: index === 0 ? "" : slot.href,
      }));
      await apiFetch("/admin/settings", { method: "PUT", body: { home_banners: JSON.stringify(payload) } });
      toast.success("首页轮播已保存，官网最迟约 5 分钟生效");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const disabled = saving || pickerBusy;
  const hasImage = slots.some((slot) => slot.url !== "");

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">首页轮播</h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="inline-flex min-h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5"
        >
          {saving ? "保存中..." : "保存首页轮播"}
        </button>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        第 1 张是首屏主图：留空即保持官网现有默认 Banner（原有悬浮文字与按钮不变），选图则替换首图。第 2、3 张是可选的附加轮播（留空或未启用即不参与），仅显示图片、可配整图跳转链接（站内路径如 /products 或 https 链接）。图片从媒体库选择或直接上传，未选相册时进入「未分类」。
      </p>

      {/* 产图标准：运营换图时最需要看到的信息，折叠收纳避免压过操作区 */}
      <details className="mb-4 rounded-xl border border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">首屏图标准与裁切提示（点开查看）</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>尺寸</strong>：建议 1920×1080（16:9），最低 1280×720；三张尽量统一比例。</li>
          <li><strong>格式与体积</strong>：照片用 JPG / WebP，图形稿用 PNG；单张建议 ≤ 500KB（上传上限 10MB，首屏速度敏感）。</li>
          <li><strong>裁切方式</strong>：官网按「铺满 + 居中裁切」显示 —— 主体请居中，四周留 ≥10% 安全边距，别把关键元素贴边。</li>
          <li><strong>第 1 张</strong>：左侧会叠加公司标题与按钮（桌面字更大），左侧约 60% 不要放关键主体，背景别过亮过花（文字下方有深色渐变）。</li>
          <li><strong>手机竖屏</strong>：左右会被裁掉较多（画面接近竖向），桌面超宽屏上下会被裁掉 —— 重要元素越靠中心越安全。</li>
          <li><strong>手机端专用图（每个槽位可选）</strong>：如果不想让宽图被裁，给该槽位再配一张竖版图（建议 1080×1350 4:5 或 1080×1920 9:16，≤350KB）；配了之后<strong>手机端只加载这张</strong>，桌面仍用上面那张宽图。两者构图建议呼应（同一主体、同一色调）。</li>
          <li><strong>第 2、3 张</strong>：纯图展示，若要带文案请直接排进图片（注意手机端字号别太小）。</li>
        </ul>
      </details>

      <div className="space-y-4">
        {slots.map((slot, index) => {
          const isLead = index === 0;
          return (
          <div key={index} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isLead ? "第 1 张（首屏主图 · 保留官网悬浮文字与按钮）" : `第 ${index + 1} 张（仅图片）`}
              </span>
              {/* 第 1 张恒为首屏主图：留空即官网默认 Banner，因此没有启用开关 */}
              {!isLead && (
                <label className="flex min-h-10 items-center gap-2 text-sm text-gray-600 select-none sm:min-h-0 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    disabled={disabled || !slot.url}
                    onChange={(e) => updateSlot(index, { enabled: e.target.checked })}
                    aria-label={`启用第 ${index + 1} 张轮播图`}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:opacity-40"
                  />
                  启用
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-start gap-3">
              {slot.url ? (
                <MediaThumb url={slot.url} title={`第 ${index + 1} 张轮播图`} className="h-20 w-32 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 px-2 text-center text-xs text-gray-400 dark:border-gray-700">
                  {isLead ? "官网默认 Banner" : "未选择"}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerFor({ index, variant: "desktop" })}
                  disabled={disabled}
                  className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:min-h-0 sm:py-1.5 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {slot.url ? (isLead ? "更换首图" : "更换图片") : "从媒体库选择"}
                </button>
                {slot.url && (
                  <button
                    type="button"
                    onClick={() => updateSlot(index, { url: "", mobileUrl: "", enabled: false, href: "" })}
                    disabled={disabled}
                    className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-red-500 hover:text-red-600 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
                  >
                    {isLead ? "恢复默认图" : "移除"}
                  </button>
                )}
              </div>
            </div>

            {/* 移动端专用图（art direction）：配了这张，手机端就只加载它，宽图不再被裁成一条 */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-200 pt-3 dark:border-gray-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">手机端专用图（可选，竖版）：</span>
              {slot.mobileUrl ? (
                <MediaThumb url={slot.mobileUrl} title={`第 ${index + 1} 张移动端图`} className="h-20 w-14 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-[10px] leading-tight text-gray-400 dark:border-gray-700">
                  未配置
                  <br />
                  （用宽图）
                </div>
              )}
              <button
                type="button"
                onClick={() => setPickerFor({ index, variant: "mobile" })}
                disabled={disabled || !slot.url}
                className="inline-flex min-h-10 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:min-h-0 sm:py-1.5 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {slot.mobileUrl ? "更换手机图" : "选择手机图"}
              </button>
              {slot.mobileUrl && (
                <button
                  type="button"
                  onClick={() => updateSlot(index, { mobileUrl: "" })}
                  disabled={disabled}
                  className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm text-red-500 hover:text-red-600 disabled:opacity-40 sm:min-h-0 sm:py-1.5"
                >
                  移除
                </button>
              )}
            </div>
            {isLead && (
              <p className="mt-2 text-xs text-gray-400">
                {slot.url ? "已替换为自定义首图；移除后回到官网默认 Banner。" : "留空即使用官网默认 Banner（现有首屏视觉保持不变）。"}
              </p>
            )}
            {/* 原生 input（同 MediaPicker 搜索框）：InputField 不透传 aria-label。
                第 1 张不带跳转链接（官网叠加层有文字按钮，整图链接会冲突），禁用输入避免静默失效 */}
            <input
              type="text"
              value={slot.href}
              onChange={(e) => updateSlot(index, { href: e.target.value })}
              disabled={disabled || isLead}
              aria-label={`第 ${index + 1} 张轮播图跳转链接`}
              placeholder={isLead ? "第 1 张保留官网文字按钮，无需链接" : "跳转链接（可选）：如 /products 或 https://…"}
              className="mt-3 h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
            />
            {slot.href !== "" && !isSafeHref(slot.href) && (
              <p className="mt-1 text-xs text-red-500">链接需以 / 开头或为 http(s) 链接，否则官网会忽略。</p>
            )}
          </div>
          );
        })}
      </div>

      {!hasImage && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">当前 3 张都留空：官网首页只显示默认 Banner，不轮播。</p>
      )}

      {pickerFor !== null && (
        <MediaPicker
          key={`${pickerFor.index}-${pickerFor.variant}`}
          mode="single"
          kind="image"
          onClose={() => setPickerFor(null)}
          onBusyChange={setPickerBusy}
          onConfirm={(picked) => confirmPick(pickerFor, picked)}
        />
      )}
    </section>
  );
}
