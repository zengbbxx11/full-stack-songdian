/*
 * 文件：app/llms.txt/route.ts（AI 站点导览 / llms.txt — 实验性）
 * 职责：按 llms.txt 社区提案生成 Markdown 站点导览，供 AI agent 按需读取。
 * 注意：llms.txt 目前仅是社区提案（proposal），不是正式标准，不保证任何
 *       AI 搜索收录或引用收益；核心公司事实来自 content-data，页面目录在本路由维护。
 * 渲染方式：Route Handler + ISR（revalidate = 3600 秒）。
 */

import { COMPANY } from "@/lib/content-data";

export const revalidate = 3600;

export function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const generated = new Date().toISOString().slice(0, 10);

  const body = `# ${COMPANY.fullName}

> ${COMPANY.description} ${COMPANY.tagline}. Songdian Technology was established in ${COMPANY.established}; its parent group has manufactured digital imaging products since ${COMPANY.founded}. Headquartered in ${COMPANY.contact.city}, ${COMPANY.contact.country}.

## Key Facts

- Legal entity: ${COMPANY.fullName}
- Legal entity established: ${COMPANY.established}
- Parent company: ${COMPANY.parentName}
- Group manufacturing roots: ${COMPANY.founded}
- Employees: ${COMPANY.employees}
- Factory size: ${COMPANY.factorySize}
- Annual output: ${COMPANY.annualOutput}
- New products per year: ${COMPANY.annualProducts}
- Registered patents: ${COMPANY.patents}
- Business scope: OEM / ODM digital camera development and manufacturing (mirrorless, compact, action, video, kids cameras, and lenses)
- Address: ${COMPANY.contact.address}
- Business contact: ${COMPANY.contact.email} / ${COMPANY.contact.phone} (${COMPANY.contact.hours})

## Main Pages

- Home: ${siteUrl}/
- Products (camera portfolio for OEM/ODM): ${siteUrl}/products
- Solutions (OEM/ODM services): ${siteUrl}/solutions
- FAQ: ${siteUrl}/solutions/faq
- About (factory, certifications, history): ${siteUrl}/about
- News & Insights: ${siteUrl}/news
- Contact / Request a quote: ${siteUrl}/contact
- Sitemap: ${siteUrl}/sitemap.xml

## Notes

- This file follows the llms.txt community proposal (experimental, not a formal standard).
- Core company facts are generated from the website's shared content configuration; the page directory is maintained in this route.
- Generated: ${generated}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
