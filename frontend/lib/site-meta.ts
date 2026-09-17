/*
 * 文件：lib/site-meta.ts（站点元数据入口 / superMeta 封装）
 * 职责：为所有页面统一初始化并导出 next-super-meta 的 superMeta。
 *
 * ⚠️ 新增页面必须从这里导入 `superMeta`，**不要**直接从 "next-super-meta" 导入。
 *
 * 原因（2026-09-17 CI 事故复盘）：
 *   next-super-meta 的站点 URL 是「模块级状态」——由 initSuperMeta() 写入，或在 superMeta() 调用时
 *   从 process.env.NEXT_PUBLIC_SITE_URL 兜底；两者都拿不到时 superMeta() 会抛错。而且实测确认：
 *   该兜底读取发生在**运行期**（next start / 容器进程的环境），构建期内联 NEXT_PUBLIC_* 不足以覆盖它。
 *   若只在 app/layout.tsx 里 initSuperMeta，而页面各自直接导入 superMeta，那么当页面模块先于 layout
 *   模块被求值（冷渲染 worker）且运行期没有 NEXT_PUBLIC_SITE_URL 时，superMeta() 抛错 → Next 退回上层
 *   metadata → **页面级 description 与 canonical 静默消失**（CI 上表现为 Lighthouse `meta-description`
 *   失败、`canonical` 变成 notApplicable，而标题因 layout 模板兜底仍然存在，很容易被忽略）。
 *   在本模块内先 init 再导出 superMeta，可保证「调用点与初始化永远在同一模块图」，与 worker/模块
 *   求值顺序、外部环境变量都无关。
 */
import { initSuperMeta, superMeta } from "next-super-meta";
import { MEDIA } from "@/lib/media";

/** 规范站点 URL；与 app/robots.ts、app/sitemap.ts、lib/seo.ts 使用同一回退口径 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

initSuperMeta({ siteUrl: SITE_URL, defaultImage: MEDIA.ogImage });

export { superMeta };
