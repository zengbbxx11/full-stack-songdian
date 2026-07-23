/*
 * 文件：app/search/page.tsx（搜索结果页 / Search）
 * 职责：产品 + 新闻联合搜索结果展示，含搜索框、类型切换、封面卡片网格与分页。
 * 数据来源（后端 /api/v1/search）：search(q, { type, page })
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）。
 *
 * 设计要点（对齐 DESIGN-tesla.md + AGENTS.md 视觉调性）：
 *  - 结果区为「响应式封面卡片网格」：桌面 3 列 / 平板 2 列 / 手机 1 列。
 *  - 卡片：封面图（无图优雅渐变占位）+ 分类 Badge + 标题（2 行截断）+ 摘要（2 行截断）
 *    + 创建时间；整卡可点击跳转；hover 轻微上浮 + 阴影 + 标题变蓝。
 *  - 顶部保留搜索输入框（带搜索图标），并通过 Tabs 切换 全部/产品/新闻。
 *  - 空状态、加载态（loading.tsx 骨架）、错误态均做友好处理。
 *  - 结果数量与耗时（took_ms）在标题下方低调展示。
 */

import Link from "next/link";
import type { Metadata } from "next";
import { search, type SearchResult } from "@/lib/api/search";
import SearchControls from "@/components/SearchControls";
import SearchResultCard from "@/components/SearchResultCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbs } from "@/lib/seo";

// ISR 重新验证间隔（秒）
export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q || "").toString().trim();
  return {
    title: query ? `Search: ${query}` : "Search",
    description: query ? `Search results for "${query}"` : "Search products and news.",
    robots: { index: false, follow: true },
  };
}

interface SearchPageProps {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}

const PAGE_SIZE = 20;
type SearchType = "all" | "product" | "news";

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const sp = await searchParams;
  const q = (sp.q || "").toString().trim();
  const type = (["all", "product", "news"].includes(sp.type ?? "") ? (sp.type as string) : "all") as SearchType;
  const page = Number(sp.page) || 1;

  // 执行搜索（空关键词不请求后端）；出错时进入友好错误态而非整页崩溃。
  let result: SearchResult | null = null;
  let errorMessage: string | null = null;

  if (q) {
    try {
      result = await search(q, { type, page, pageSize: PAGE_SIZE });
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "搜索服务暂时不可用，请稍后重试。";
    }
  } else {
    // 无关键词：返回空结果占位（保持类型一致，用于类型切换等场景）。
    result = { items: [], total: 0, tookMs: 0, degraded: false, note: "" };
  }

  const breadcrumbs = generateBreadcrumbs([{ label: "Search" }]);
  const totalPages = result && result.total > 0 ? Math.ceil(result.total / PAGE_SIZE) : 1;

  return (
    <>
      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="bg-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-6">
          {/* ====================== 标题 + 结果计数 ====================== */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[#171A20] md:text-3xl">Search</h1>
            {q && result && !errorMessage && (
              <p className="mt-2 text-sm text-[#5C5E62]">
                {result.total} result{result.total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
                <span className="ml-2 text-[#8E8E8E]">· {result.tookMs} ms</span>
              </p>
            )}
          </div>

          {/* ====================== 搜索框 + 类型切换 ====================== */}
          <SearchControls initialQuery={q} initialType={type} />

          {/* 降级提示（后端搜索不可用时给出友好说明，不阻断页面） */}
          {result?.degraded && result.note && (
            <div className="mt-6 rounded-xl border border-[#EEEEEE] bg-[#F4F4F4] px-4 py-3 text-sm text-[#5C5E62]">
              {result.note}
            </div>
          )}

          {/* ====================== 状态分支 ====================== */}
          {!q ? (
            // 未输入关键词
            <div className="mt-12 rounded-xl border border-[#EEEEEE] bg-[#F4F4F4] py-24 text-center">
              <h3 className="mb-2 text-lg font-semibold text-[#171A20]">Enter a search term</h3>
              <p className="text-sm text-[#5C5E62]">Find products and news across the site.</p>
            </div>
          ) : errorMessage ? (
            // 错误态
            <div className="mt-12 rounded-xl border border-[#EEEEEE] bg-[#F4F4F4] py-24 text-center">
              <h3 className="mb-2 text-lg font-semibold text-[#171A20]">Something went wrong</h3>
              <p className="mx-auto mb-6 max-w-md text-sm text-[#5C5E62]">{errorMessage}</p>
              <Link
                href={`/search?q=${encodeURIComponent(q)}&type=${type}`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#3E6AE1] px-5 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#3561CC]"
              >
                Retry
              </Link>
            </div>
          ) : result && result.items.length > 0 ? (
            // 结果网格
            <>
              <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((item) => (
                  <SearchResultCard key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>

              {/* 分页（保留原有逻辑） */}
              {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-2">
                  {page > 1 && (
                    <Link
                      href={`/search?q=${encodeURIComponent(q)}&type=${type}&page=${page - 1}`}
                      className="rounded-lg bg-[#F4F4F4] px-5 py-2.5 text-sm font-medium text-[#393C41] transition-colors duration-300 hover:bg-[#E9E9E9]"
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-4 py-2.5 text-sm text-[#5C5E62]">
                    Page {page} / {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={`/search?q=${encodeURIComponent(q)}&type=${type}&page=${page + 1}`}
                      className="rounded-lg bg-[#F4F4F4] px-5 py-2.5 text-sm font-medium text-[#393C41] transition-colors duration-300 hover:bg-[#E9E9E9]"
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            // 空状态
            <div className="mt-12 rounded-xl border border-[#EEEEEE] bg-[#F4F4F4] py-24 text-center">
              <h3 className="mb-2 text-lg font-semibold text-[#171A20]">No results found</h3>
              <p className="text-sm text-[#5C5E62]">Try a different keyword or category.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
