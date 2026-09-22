/*
 * 文件：app/news/page.tsx（新闻列表 / News）
 * 职责：新闻/资讯列表页，含头条推荐、文章网格与分页导航。
 * 数据来源（后端 FastAPI /api/v1）：getPosts() —— 文章列表（支持 page 分页，每页 9 篇）。
 * 渲染方式：动态 SSR（读取 searchParams）；API 数据缓存 60 秒。
 * 是否含 client 组件：否（列表为服务端渲染，卡片为展示型组件）。
 */

import Link from "next/link";
import { readListQuery, listUrl, type ListSearchParams } from "@/lib/list-query";
import SafeImage from "@/components/SafeImage";
import PostCard from "@/components/PostCard";
import type { Metadata } from "next";
import { superMeta } from "@/lib/site-meta";
import { getNewsPage } from "@/lib/api/list-pages";
import Breadcrumbs from "@/components/Breadcrumbs";
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
  const { category, items: posts, pagination, failed: loadError, retryCategory } = await getNewsPage(currentPage, categorySlug);

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
          <header className="mb-8 border-b border-black/10 pb-7 sm:mb-10 sm:pb-9">
            <h1 className="text-[var(--foreground)]">
              {category ? (
                <span className="block max-w-4xl text-[clamp(2rem,4.5vw,3.75rem)] font-semibold leading-[1.1] tracking-[-0.045em] text-balance">{category.name}</span>
              ) : (
                <>
                  <span className="mb-3 flex items-center gap-3 text-[10px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-[var(--muted-foreground)] sm:mb-4 sm:text-xs sm:tracking-[0.22em]">
                    <span aria-hidden="true" className="h-px w-7 shrink-0 bg-[var(--accent)] sm:w-10" />
                    Camera Manufacturing
                  </span>{" "}
                  <span className="block text-[clamp(2rem,4.5vw,3.75rem)] font-semibold leading-[1.1] tracking-[-0.045em] text-balance">
                    News <span className="font-normal text-[var(--accent)]">&amp;</span> Insights
                  </span>
                </>
              )}
            </h1>
          </header>
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
              {/* 有封面时突出图文；无封面时保持紧凑的文字头条。 */}
              {featured && (
                <Link
                  prefetch={false}
                  href={`/news/${featured.slug}`}
                  className={`group mb-10 grid overflow-hidden rounded-2xl border border-black/8 bg-[var(--muted)] transition-[border-color,box-shadow] duration-300 hover:border-black/20 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] ${featured.featuredImage ? "md:grid-cols-2" : ""}`}
                >
                  {featured.featuredImage && (
                    <div className="relative aspect-[16/10] overflow-hidden bg-gray-100 md:aspect-auto md:min-h-[300px]">
                      <SafeImage
                        src={featured.featuredImage}
                        alt={featured.featuredImageAlt}
                        fill
                        sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1279px) calc(50vw - 24px), 616px"
                        className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.025]"
                        preload
                        fallback={<div className="absolute inset-0 bg-[var(--muted)]" />}
                      />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
                    <span className="mb-4 text-xs font-medium tracking-wide text-[var(--muted-foreground)]">{featured.date}</span>
                    <h2 className="mb-3 max-w-3xl text-2xl font-semibold leading-snug tracking-tight text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)] group-focus-visible:text-[var(--accent)] lg:text-3xl">
                      {featured.title}
                    </h2>
                    <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)] line-clamp-3 sm:text-base">{featured.excerpt}</p>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                      Read Article
                      <svg aria-hidden="true" className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </span>
                  </div>
                </Link>
              )}

              <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
                {remaining.map((post) => (
                  <PostCard key={post.id} post={post} showAuthor={false} sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(33.333vw - 32px), 395px" />
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
                  {currentPage > 1 && (
                    <Link
                      prefetch={false}
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
                      prefetch={false}
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
