/*
 * 文件：app/news/page.tsx（新闻列表 / News）
 * 职责：新闻/资讯列表页，含头条推荐、文章网格与分页导航。
 * 数据来源（后端 FastAPI /api/v1）：getPosts() —— 文章列表（支持 page 分页，每页 9 篇）。
 * 渲染方式：动态 SSR（读取 searchParams）；API 数据缓存 60 秒。
 * 是否含 client 组件：否（列表为服务端渲染，卡片为展示型组件）。
 */

import Link from "next/link";
import { readListQuery, listUrl, type ListSearchParams } from "@/lib/list-query";
import Image from "next/image";
import type { Metadata } from "next";
import { superMeta } from "@/lib/site-meta";
import { getNewsPage } from "@/lib/api/list-pages";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpotlightCard from "@/components/SpotlightCard";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";


export async function generateMetadata({ searchParams }: { searchParams: Promise<ListSearchParams> }): Promise<Metadata> {
  const { category: categorySlug, page: requestedPage } = readListQuery(await searchParams);
  const { category, pagination, failed, retryCategory } = await getNewsPage(requestedPage, categorySlug);
  const outOfRange = !failed && requestedPage > (pagination?.totalPages || 1);
  const canonicalPage = outOfRange ? 1 : requestedPage;

  const meta = await superMeta({
    title: (category ? category.name + " | Camera Manufacturing News" : "Camera Manufacturing News & Insights") + (canonicalPage > 1 ? " | Page " + canonicalPage : ""),
    description: `${category ? category.name + ": " : ""}Industry insights, product announcements, and camera manufacturing expertise from ${COMPANY.name}.${canonicalPage > 1 ? " Page " + canonicalPage + "." : ""}`,
    url: listUrl("/news", canonicalPage, failed ? retryCategory : category?.slug),
  });

  // 超范围页码：声明首页为规范页并禁止索引，避免低质重复页。
  return failed || outOfRange ? { ...meta, robots: { index: false, follow: true } } : meta;
}

// searchParams 使整页动态渲染；此值不代表整页 ISR，API 数据仍缓存 60 秒。
export const revalidate = 60;

interface NewsPageProps {
  searchParams: Promise<ListSearchParams>;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const { category: categorySlug, page: currentPage } = readListQuery(await searchParams);
  const { categories, category, items: posts, pagination, failed: loadError, retryCategory } = await getNewsPage(currentPage, categorySlug);

  const breadcrumbs = generateBreadcrumbs([{ label: "News" }]);

  const featured = posts[0];
  const remaining = posts.slice(1);

  return (
    <>
      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "var(--foreground)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 文章列表 */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <h1 className="mb-8 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">{category?.name || "Camera Manufacturing News & Insights"}</h1>
          <nav aria-label="News categories" className="mb-8 flex flex-wrap gap-2">
            {[{ id: 0, name: "All News", slug: "" }, ...categories].map(item => <Link key={item.id} prefetch={false} href={listUrl("/news", 1, item.slug)} aria-current={!loadError && (category?.slug || "") === item.slug ? "page" : undefined} className="rounded-full border px-4 py-3 text-sm aria-[current=page]:bg-[var(--accent)] aria-[current=page]:text-white">{item.name}</Link>)}
          </nav>
          {loadError ? (
            <div className="text-center py-24 bg-gray-50 border border-[var(--border)]" style={{ borderRadius: "12px" }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">News Unavailable</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">We could not load this list right now. Please try again.</p>
              <a
                href={listUrl("/news", currentPage, retryCategory)}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#3E6AE1] px-5 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#3561CC]"
              >
                Retry
              </a>
            </div>
          ) : posts.length > 0 ? (
            <>
              {/* 精选 */}
              {featured && (
                <SpotlightCard>
                <Link
                  href={`/news/${featured.slug}`}
                  className="group block relative overflow-hidden mb-10 border border-transparent hover:border-[#3E6AE1] hover:shadow-sm transition-all h-full w-full"
                  style={{ backgroundColor: "var(--muted)", borderRadius: "12px", transitionDuration: "0.3s" }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 min-h-[320px]">
                    <div className="relative aspect-[4/3] md:aspect-auto bg-gray-800 overflow-hidden" style={{ borderRadius: "12px 0 0 12px" }}>
                      {featured.featuredImage ? (
                        <Image
                          src={featured.featuredImage}
                          alt={featured.featuredImageAlt}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover group-hover:brightness-[1.06] transition-all"
                          style={{ transitionDuration: "0.3s" }}
                          preload
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center p-8 md:p-10 relative z-10" style={{ backgroundColor: "var(--muted)" }}>
                      <div className="flex items-center gap-3 mb-3">
                        {featured.categories.length > 0 && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full" style={{ backgroundColor: "rgba(62,106,225,0.2)", color: "#3E6AE1" }}>
                            {featured.categories[0].name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{featured.date}</span>
                      </div>
                      <h2 className="text-xl md:text-2xl font-medium leading-snug mb-3" style={{ color: "var(--foreground)" }}>
                        {featured.title}
                      </h2>
                      <p className="text-sm line-clamp-3 leading-relaxed mb-5" style={{ color: "var(--muted-foreground)" }}>{featured.excerpt}</p>
                      <span className="inline-flex items-center text-sm font-medium transition-colors" style={{ color: "#3E6AE1", transitionDuration: "0.33s" }}>
                        Read Article
                        <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                      </span>
                    </div>
                  </div>
                </Link>
                </SpotlightCard>
              )}

              {/* 网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {remaining.map((post) => (
                  <SpotlightCard key={post.id} className="h-full">
                  <Link
                    href={`/news/${post.slug}`}
                    className="group flex flex-col sm:flex-row gap-5 bg-white border border-[var(--border)] hover:border-[#3E6AE1] hover:shadow-sm overflow-hidden transition-all h-full w-full"
                    style={{ borderRadius: "12px", transitionDuration: "0.3s" }}
                  >
                    <div className="relative sm:w-48 shrink-0 aspect-[4/3] sm:aspect-auto bg-gray-100 overflow-hidden">
                      {post.featuredImage ? (
                        <Image src={post.featuredImage} alt={post.featuredImageAlt} fill sizes="(max-width: 639px) calc(100vw - 48px), 192px" className="object-cover group-hover:brightness-[1.06] transition-all" style={{ transitionDuration: "0.3s" }} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-300"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg></div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center p-4 sm:py-4 sm:pr-5 sm:pl-0 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {post.categories.length > 0 && <span className="text-[11px] md:text-xs font-medium" style={{ color: "#3E6AE1" }}>{post.categories[0].name}</span>}
                        <span className="text-[11px] md:text-xs text-gray-400">{post.date}</span>
                      </div>
                      <h3 className="text-sm md:text-base font-semibold text-gray-900 leading-snug line-clamp-2 transition-colors mb-1.5" style={{ transitionDuration: "0.33s" }}>{post.title}</h3>
                      <p className="text-xs md:text-sm text-gray-500 line-clamp-2 leading-relaxed">{post.excerpt}</p>
                    </div>
                  </Link>
                  </SpotlightCard>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <nav aria-label="Pagination" className="flex items-center justify-center gap-2 mt-12">
                  {currentPage > 1 && (
                    <Link
                      href={listUrl("/news", currentPage - 1, category?.slug)}
                      className="px-5 py-2.5 text-sm md:text-base font-medium rounded transition-colors inline-block w-[90px] text-center"
                      style={{ color: "var(--graphite)", backgroundColor: "var(--muted)", borderRadius: "4px", transitionDuration: "0.33s" }}
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-4 py-2.5 text-sm" style={{ color: "var(--muted-foreground)" }}>Page {currentPage} / {pagination.totalPages}</span>
                  {currentPage < pagination.totalPages && (
                    <Link
                      href={listUrl("/news", currentPage + 1, category?.slug)}
                      className="px-5 py-2.5 text-sm md:text-base font-medium rounded transition-colors inline-block w-[90px] text-center"
                      style={{ color: "var(--graphite)", backgroundColor: "var(--muted)", borderRadius: "4px", transitionDuration: "0.33s" }}
                    >
                      Next
                    </Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <div className="text-center py-24 bg-gray-50 border border-[var(--border)]" style={{ borderRadius: "12px" }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Articles Yet</h3>
              <p className="text-sm text-gray-500">New articles are on the way — please check back soon.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
