/*
 * 文件：app/news/page.tsx（新闻列表 / News）
 * 职责：新闻/资讯列表页，含头条推荐、文章网格与分页导航。
 * 数据来源（WP REST API）：getPosts() —— WP 文章列表（支持 page 分页，每页 9 篇）。
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）。
 * 是否含 client 组件：否（列表为服务端渲染，卡片为展示型组件）。
 */

import Link from "next/link";
import Image from "next/image";
import { superMeta } from "next-super-meta";
import { getPosts } from "@/lib/api/news";
import Breadcrumbs from "@/components/Breadcrumbs";
import SpotlightCard from "@/components/SpotlightCard";
import { generateBreadcrumbs } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";

export const metadata = await superMeta({
  title: "News & Insights",
  description: `Industry insights, product announcements, and camera manufacturing expertise from ${COMPANY.name}. Stay informed on the latest from Songdian Technology.`,
  url: "/news",
});

// ISR 重新验证间隔（秒）：每 60 秒重新生成新闻列表，平衡实时性与性能
export const revalidate = 60;

interface NewsPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;

  const { posts, pagination } = await getPosts({ page: currentPage, perPage: 9 });

  const breadcrumbs = generateBreadcrumbs([{ label: "News" }]);

  const featured = posts[0];
  const remaining = posts.slice(1);

  return (
    <>
      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 文章列表 */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {posts.length > 0 ? (
            <>
              {/* 精选 */}
              {featured && (
                <SpotlightCard>
                <Link
                  href={`/news/${featured.slug}`}
                  className="group block relative overflow-hidden mb-10 border border-transparent hover:border-[#3E6AE1] hover:shadow-sm transition-all h-full w-full"
                  style={{ backgroundColor: "#F4F4F4", borderRadius: "12px", transitionDuration: "0.3s" }}
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
                          priority
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center p-8 md:p-10 relative z-10" style={{ backgroundColor: "#F4F4F4" }}>
                      <div className="flex items-center gap-3 mb-3">
                        {featured.categories.length > 0 && (
                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full" style={{ backgroundColor: "rgba(62,106,225,0.2)", color: "#3E6AE1" }}>
                            {featured.categories[0].name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{featured.date}</span>
                      </div>
                      <h2 className="text-xl md:text-2xl font-medium leading-snug mb-3" style={{ color: "#171A20" }}>
                        {featured.title}
                      </h2>
                      <p className="text-sm line-clamp-3 leading-relaxed mb-5" style={{ color: "#5C5E62" }}>{featured.excerpt}</p>
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
                    className="group flex flex-col sm:flex-row gap-5 bg-white border border-[#EEEEEE] hover:border-[#3E6AE1] hover:shadow-sm overflow-hidden transition-all h-full w-full"
                    style={{ borderRadius: "12px", transitionDuration: "0.3s" }}
                  >
                    <div className="relative sm:w-48 shrink-0 aspect-[4/3] sm:aspect-auto bg-gray-100 overflow-hidden">
                      {post.featuredImage ? (
                        <Image src={post.featuredImage} alt={post.featuredImageAlt} fill sizes="200px" className="object-cover group-hover:brightness-[1.06] transition-all" style={{ transitionDuration: "0.3s" }} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-300"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg></div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center p-4 sm:py-4 sm:pr-5 sm:pl-0 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {post.categories.length > 0 && <span className="text-[11px] font-medium" style={{ color: "#3E6AE1" }}>{post.categories[0].name}</span>}
                        <span className="text-[11px] text-gray-400">{post.date}</span>
                      </div>
                      <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 transition-colors mb-1.5" style={{ transitionDuration: "0.33s" }}>{post.title}</h3>
                      <p className="text-[13px] text-gray-500 line-clamp-2 leading-relaxed">{post.excerpt}</p>
                    </div>
                  </Link>
                  </SpotlightCard>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-12">
                  {currentPage > 1 && (
                    <Link
                      href={`/news?page=${currentPage - 1}`}
                      className="px-5 py-2.5 text-sm font-medium rounded transition-all"
                      style={{ fontSize: "14px", fontWeight: 500, color: "#393C41", backgroundColor: "#F4F4F4", borderRadius: "4px", transitionDuration: "0.33s" }}
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-4 py-2.5 text-sm" style={{ color: "#5C5E62" }}>Page {currentPage} / {pagination.totalPages}</span>
                  {currentPage < pagination.totalPages && (
                    <Link
                      href={`/news?page=${currentPage + 1}`}
                      className="px-5 py-2.5 text-sm font-medium rounded transition-all"
                      style={{ fontSize: "14px", fontWeight: 500, color: "#393C41", backgroundColor: "#F4F4F4", borderRadius: "4px", transitionDuration: "0.33s" }}
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24 bg-gray-50 border border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Articles Yet</h3>
              <p className="text-sm text-gray-500">News articles will appear here once published in WordPress.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
