/*
 * 文件：scripts/report-lighthouse-failures.mjs
 * 职责：把 `.lighthouseci/reports` 里每个页面的 SEO 分类结果打印到 stdout，
 *       重点输出「得分 < 1 的审计项 + 它的 details.items」，让 CI 失败自解释。
 * 背景：`lhci assert` 只报「categories.seo 0.92 < 0.95」，不说是哪一项审计失败；
 *       而 CI 日志/artifact 需要鉴权才能取，定位一次失败成本很高。本脚本只读报告、
 *       只打印信息，**不改变**任何断言结果（永远以退出码 0 结束）。
 * 运行：node scripts/report-lighthouse-failures.mjs（需先跑过 npm run lighthouse）
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const reportsDir = fileURLToPath(new URL("../.lighthouseci/reports", import.meta.url));
const MAX_DETAIL = 900;

/** details.items 只保留前几条，避免日志过长淹没关键信息。 */
function summarizeDetails(audit) {
  const items = audit?.details?.items;
  if (!Array.isArray(items) || items.length === 0) return "";
  const head = items.slice(0, 3).map(item => {
    const { node, ...rest } = item ?? {};
    const pick = {
      ...rest,
      ...(node?.snippet ? { snippet: node.snippet } : {}),
      ...(node?.selector ? { selector: node.selector } : {}),
    };
    return pick;
  });
  const rendered = JSON.stringify(head);
  const more = items.length > 3 ? ` …(+${items.length - 3} 条)` : "";
  return `${rendered.slice(0, MAX_DETAIL)}${rendered.length > MAX_DETAIL ? "…" : ""}${more}`;
}

function auditLine(audit) {
  const score = audit?.score === null || audit?.score === undefined ? "n/a" : audit.score;
  const display = audit?.displayValue ? ` (${audit.displayValue})` : "";
  return `${audit?.id ?? "?"}=${score}${display}`;
}

try {
  let files = [];
  try {
    files = readdirSync(reportsDir).filter(name => name.endsWith(".report.json")).sort();
  } catch {
    console.log(`[lighthouse-failures] 未找到报告目录 ${reportsDir}（构建或 Lighthouse 未跑完？）`);
    process.exit(0);
  }
  if (files.length === 0) {
    console.log(`[lighthouse-failures] ${reportsDir} 下没有 .json 报告。`);
    process.exit(0);
  }

  console.log(`[lighthouse-failures] 报告目录：${reportsDir}（${files.length} 份）`);
  for (const file of files) {
    let report;
    try {
      report = JSON.parse(readFileSync(path.join(reportsDir, file), "utf8"));
    } catch (error) {
      console.log(`[lighthouse-failures] ${file} 解析失败：${error instanceof Error ? error.message : error}`);
      continue;
    }

    const url = report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || file;
    const seo = report.categories?.seo;
    const scores = Object.entries(report.categories ?? {})
      .map(([key, value]) => `${key}=${value?.score ?? "n/a"}`)
      .join(" ");
    console.log(`\n=== ${url} :: ${file}`);
    console.log(`    分类：${scores}（lighthouse ${report.lighthouseVersion ?? "?"}）`);

    if (report.runtimeError) {
      console.log(`    运行期错误：${JSON.stringify(report.runtimeError).slice(0, MAX_DETAIL)}`);
    }
    if (!seo) {
      console.log("    没有 seo 分类结果。");
      continue;
    }

    const audits = (seo.auditRefs ?? [])
      .map(ref => report.audits?.[ref.id])
      .filter(Boolean);
    const failing = audits.filter(audit => audit.score !== null && audit.score !== undefined && audit.score < 1);

    if (failing.length === 0) {
      console.log("    SEO 全部通过。");
      continue;
    }

    console.log(`    SEO 未通过项（${failing.length}）：`);
    for (const audit of failing) {
      console.log(`      ✘ ${auditLine(audit)} — ${audit.title ?? ""}`);
      if (audit.description) console.log(`        说明：${String(audit.description).replace(/\s+/g, " ").slice(0, 240)}`);
      const details = summarizeDetails(audit);
      if (details) console.log(`        details.items：${details}`);
    }
    console.log(`    SEO 全量得分：${audits.map(auditLine).join(" ")}`);
  }
} catch (error) {
  // 诊断脚本绝不能改变 CI 结论。
  console.log(`[lighthouse-failures] 打印失败（不影响构建结果）：${error instanceof Error ? error.stack : error}`);
}
process.exit(0);
