/*
 * 文件：app/news/[slug]/page.tsx（新闻文章详情 / News Detail）
 * 职责：单篇文章详情页，含面包屑、正文、标签、相关文章与 JSON-LD（articleSchema）。
 * 数据来源（WP REST API）：
 *   - getPostBySlug(slug) → 单篇文章
 *   - getAllPostSlugs()   → 文章 slug 列表（用于 SSG 预渲染）
 *   - getPosts()          → 同类相关文章
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）+ generateStaticParams 预生成。
 * 是否含 client 组件：否。
 */

import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getPostBySlug, getAllPostSlugs, getPosts, getAdjacentPosts } from "@/lib/api/news";
import Breadcrumbs from "@/components/Breadcrumbs";
import PostCard from "@/components/PostCard";
import { generateBreadcrumbs, articleSchema, safeJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/api/client";
import { cleanPostContent } from "@/lib/html-cleaner";

// ISR 重新验证间隔（秒）：每 60 秒重新生成文章详情
export const revalidate = 60;

// 预生成所有文章静态路径（SSG）：从 WP 拉取全部文章 slug
export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

// 动态生成该文章的 SEO 元信息（title / description / canonical / Open Graph）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: post.title,
    description: post.excerpt?.slice(0, 160),
    alternates: { canonical: `/news/${slug}` },
    openGraph: {
      title: post.title, description: post.excerpt?.slice(0, 160),
      images: post.featuredImage ? [{ url: post.featuredImage, width: 1200, height: 630 }] : [],
      type: "article", publishedTime: post.date, modifiedTime: post.modified, authors: [post.author],
    },
  };
}

export default async function NewsDetailPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Article Not Found</h1>
        <Link href="/news" className="text-sm hover:underline" style={{ color: "#3E6AE1" }}>&larr; Back to News</Link>
      </div>
    );
  }

  const breadcrumbs = generateBreadcrumbs([{ label: "News", href: "/news" }, { label: post.title }]);

  const schema = articleSchema({
    title: post.title, description: post.excerpt?.slice(0, 160) || "",
    image: post.featuredImage, datePublished: post.date, dateModified: post.modified,
    author: post.author, url: `/news/${slug}`,
  });

  // 获取同类相关文章（取首个分类，最多 4 篇，失败时忽略）
  let relatedPosts: Awaited<ReturnType<typeof getPosts>> = { posts: [], pagination: { total: 0, totalPages: 0 } };
  if (post.categories.length > 0) {
    try { relatedPosts = await getPosts({ categoryId: post.categories[0].id, perPage: 4 }); } catch { /* ignore */ }
  }

  const related = relatedPosts.posts.filter((p) => p.id !== post.id).slice(0, 3);

  // 上一篇 / 下一篇（按发布时间降序定位相邻文章）
  const { prev: prevPost, next: nextPost } = await getAdjacentPosts(slug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />

      <section className="py-6 md:py-8" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-3xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />

          {post.categories.length > 0 && (
            <Link
              href={`/news?category=${post.categories[0].slug}`}
              className="inline-block mt-4 px-3 py-1 text-xs font-semibold rounded-full transition-colors bg-[rgba(62,106,225,0.15)] hover:bg-[rgba(62,106,225,0.25)]"
              style={{
                color: "#3E6AE1",
                transitionDuration: "0.33s",
              }}
            >
              {post.categories[0].name}
            </Link>
          )}

          <h1 className="text-[1.5rem] md:text-[2rem] font-medium text-white tracking-normal leading-[1.15] mt-3 mb-3">
            {post.title}
          </h1>

          <div className="text-sm">
            <time dateTime={post.date} className="text-gray-400">{formatDate(post.date)}</time>
          </div>
        </div>
      </section>

      {/* 文章正文 */}
      <article className="bg-white pt-8 md:pt-10 pb-16 md:pb-20">
        <div className="max-w-3xl mx-auto px-6">

          {/* 特色图片 — 限制高度，确保首屏可见正文 */}
          {post.featuredImage && (
            <div className="relative mb-5 overflow-hidden bg-gray-100 max-h-[360px]" style={{ borderRadius: "12px" }}>
              <Image
                src={post.featuredImage}
                alt={post.featuredImageAlt}
                width={800}
                height={400}
                className="w-full h-auto max-h-[360px] object-contain"
                priority
              />
            </div>
          )}

          <div className="article-body" dangerouslySetInnerHTML={{ __html: cleanPostContent(post.content) }} />

          {/* 标签 —— 背景 #F4F4F4、文字 #5C5E62 */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-14 pt-10 border-t border-[#EEEEEE]">
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: "#F4F4F4", color: "#5C5E62" }}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          {/* 上一篇 / 下一篇 —— 相邻文章导航 */}
          {(prevPost || nextPost) && (
            <nav aria-label="Post navigation" className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {prevPost ? (
                <Link
                  href={`/news/${prevPost.slug}`}
                  className="group flex flex-col gap-1 rounded-xl border border-[#EEEEEE] px-5 py-4 transition-colors hover:border-[#d4343e]"
                >
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: "#5C5E62" }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                  </span>
                  <span className="text-[15px] font-medium leading-snug text-[#171A20] transition-colors group-hover:text-[#d4343e]">
                    {prevPost.title}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: "#8E8E8E" }}>{prevPost.date}</span>
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}

              {nextPost ? (
                <Link
                  href={`/news/${nextPost.slug}`}
                  className="group flex flex-col gap-1 rounded-xl border border-[#EEEEEE] px-5 py-4 sm:items-end sm:text-right transition-colors hover:border-[#d4343e]"
                >
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: "#5C5E62" }}>
                    Next
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                  <span className="text-[15px] font-medium leading-snug text-[#171A20] transition-colors group-hover:text-[#d4343e]">
                    {nextPost.title}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: "#8E8E8E" }}>{nextPost.date}</span>
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          )}

          {/* 返回资讯列表 —— 蓝色链接 */}
          <div className="mt-12">
            <Link
              href="/news"
              className="inline-flex items-center text-sm font-medium transition-colors group text-[#3E6AE1] hover:text-[#3561CC]"
              style={{ transitionDuration: "0.33s" }}
            >
              <svg className="w-4 h-4 mr-1.5 transition-transform" style={{ transitionDuration: "0.33s" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to News
            </Link>
          </div>
        </div>
      </article>

      {/* 相关文章 */}
      {related.length > 0 && (
        <section className="py-16 md:py-20 bg-gray-50 border-t border-[#EEEEEE]">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-xl md:text-2xl font-medium text-gray-900 tracking-normal mb-8">
              More Articles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
