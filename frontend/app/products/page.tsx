/*
 * 文件：app/products/page.tsx（产品列表 / Products）
 * 职责：产品列表页，含分类筛选、产品网格与分页。
 * 数据来源（后端 FastAPI /api/v1）：
 *   - getProducts()         → 产品列表（支持 page 分页与 category 筛选，每页 12 个）
 *   - getProductCategories()→ 产品分类（用于筛选按钮）
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）。
 * 是否含 client 组件：否。
 */

import Link from "next/link";
import type { Metadata } from "next";
import { superMeta } from "next-super-meta";
import { getProducts, getProductCategories, PRODUCTS_PER_PAGE } from "@/lib/api/products";
import ProductCard from "@/components/ProductCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbs } from "@/lib/seo";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import HorizontalScrollArea from "@/components/HorizontalScrollArea";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string; page?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const slug = sp.category;
  const cats = await getProductCategories().catch(() => []);
  const cat = slug ? cats.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) : undefined;

  // 页码规范化：非数字 / <1 一律按首页处理（canonical 去掉 page=1）。
  const requested = Number(sp.page);
  const requestedPage = Number.isInteger(requested) && requested > 1 ? requested : 1;

  // 有效页码 >1 时必须声明自身 canonical（保留分类）；超范围页回退首页并 noindex。
  // 与页面组件共用同一次 getProducts 请求（Next 对同一 fetch 去重）。
  let canonicalPage = requestedPage;
  let outOfRange = false;
  if (requestedPage > 1) {
    try {
      const { pagination } = await getProducts({
        page: requestedPage,
        perPage: PRODUCTS_PER_PAGE,
        category: cat?.id,
      });
      if (!pagination || requestedPage > pagination.totalPages) {
        canonicalPage = 1;
        outOfRange = true;
      }
    } catch {
      canonicalPage = 1;
      outOfRange = true;
    }
  }

  const params = new URLSearchParams();
  if (cat) params.set("category", cat.slug);
  if (canonicalPage > 1) params.set("page", String(canonicalPage));
  const query = params.toString();
  const canonicalUrl = query ? `/products?${query}` : "/products";

  const meta = cat
    ? await superMeta({
        title: `${cat.name} Cameras for OEM & ODM`,
        description: `Browse ${cat.name.toLowerCase()} cameras manufactured by Songdian Technology, an OEM/ODM digital camera factory.`,
        url: canonicalUrl,
      })
    : await superMeta({
        title: "Digital Camera Products for OEM & ODM",
        description: "Explore OEM and ODM digital cameras manufactured by Songdian Technology, a digital camera factory specializing in camera development and manufacturing.",
        url: canonicalUrl,
      });

  // 超范围页码：声明首页为规范页并禁止索引，避免低质重复页。
  return outOfRange ? { ...meta, robots: { index: false, follow: true } } : meta;
}

// ISR 重新验证间隔（秒）：每 60 秒重新生成产品列表，平衡实时性与性能
export const revalidate = 60;

interface ProductsPageProps {
  searchParams: Promise<{ page?: string; category?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  // 与 generateMetadata 保持同一归一化口径：非整数 / <1 一律按首页处理。
  const requestedPage = Number(params.page);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 1 ? requestedPage : 1;
  const categorySlug = params.category || undefined;

  // 先取分类列表，再把 slug 解析为后端数字分类 ID（getProducts 需要 ID）
  const rawCategories = await getProductCategories().catch(() => []);
  const matchedCategory = categorySlug
    ? rawCategories.find((c) => c.slug.toLowerCase() === categorySlug.toLowerCase())
    : undefined;
  const categoryFilterId = matchedCategory?.id;

  // 接口失败时优雅降级：渲染友好提示而非整页崩溃
  let products: Awaited<ReturnType<typeof getProducts>>["products"] = [];
  let pagination: Awaited<ReturnType<typeof getProducts>>["pagination"] = null;
  let loadError: string | null = null;
  try {
    const data = await getProducts({
      page: currentPage,
      perPage: 12,
      category: categoryFilterId,
    });
    products = data.products;
    pagination = data.pagination;
  } catch (e) {
    loadError = e instanceof Error ? e.message : "产品服务暂时不可用，请稍后重试。";
  }

  // 按指定顺序排列分类按钮
  const categoryOrder = ["mirrorless", "compact", "action", "video", "kids", "lens"];
  const categories = [...rawCategories].sort((a, b) => {
    const ai = categoryOrder.findIndex(
      (k) => a.slug.toLowerCase().includes(k) || a.name.toLowerCase().includes(k)
    );
    const bi = categoryOrder.findIndex(
      (k) => b.slug.toLowerCase().includes(k) || b.name.toLowerCase().includes(k)
    );
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const breadcrumbs = generateBreadcrumbs(
    matchedCategory
      ? [{ label: "Products", href: "/products" }, { label: matchedCategory.name }]
      : [{ label: "Products" }]
  );

  return (
    <>
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-3">
        <div className="site-container">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="bg-[var(--surface-dark)] pb-7 pt-4 text-white md:pb-8 md:pt-5">
        <div className="site-container grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="section-eyebrow">Product Portfolio</p>
            <h1 className="mt-2.5 text-[clamp(2.35rem,4vw,3.5rem)] font-semibold leading-[1] tracking-[-0.045em]">
              {matchedCategory?.name || "Camera Products"}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/62 md:text-base">
              Explore our current camera portfolio for OEM and ODM projects. Select a category to narrow the collection.
            </p>
          </div>
          <div className="border-l border-white/15 pl-5 lg:mb-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Available products</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{pagination?.total ?? products.length}</p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface-soft)] pb-16 pt-8 md:pb-20 md:pt-10">
        <div className="site-container">
          {/* 产品分类筛选 */}
          {categories.length > 0 && (
            <div className="mb-10 overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-[0_18px_50px_rgba(17,19,22,0.06)]">
              <div className="border-b border-black/[0.06] bg-gradient-to-r from-[#fafafa] to-white px-5 py-4 md:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-[var(--foreground)]">Browse by category</p>
                    <p className="text-sm text-[#777b81]">Choose a camera type to refine the collection</p>
                  </div>
                </div>
              </div>
              <HorizontalScrollArea ariaLabel="Product categories" className="px-5 pt-5 md:overflow-visible md:px-6 md:pb-5">
              <div className="flex gap-2.5 pb-1 md:flex-wrap">
                <Link
                  href="/products"
                  aria-current={!categorySlug ? "page" : undefined}
                  className={`inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center rounded-full border px-5 py-2.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${!categorySlug ? "border-[var(--foreground)] bg-[var(--foreground)] text-white shadow-sm" : "border-black/10 bg-[#f8f8f9] text-[var(--graphite)] hover:border-[var(--accent)]/50 hover:bg-white hover:text-[var(--accent)]"}`}
                >
                  All Products
                </Link>
              {categories.map((cat) => {
                const isActive = !!categorySlug && categorySlug.toLowerCase() === cat.slug.toLowerCase();
                return (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-11 shrink-0 snap-start touch-manipulation items-center justify-center rounded-full border px-5 py-2.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98]
                      ${isActive
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(212,52,62,0.22)]"
                        : "border-black/10 bg-[#f8f8f9] text-[var(--graphite)] hover:border-[var(--accent)]/50 hover:bg-white hover:text-[var(--accent)]"}`}
                  >
                    {cat.name}
                  </Link>
                );
              })}
              </div>
              </HorizontalScrollArea>
            </div>
          )}

          {/* 产品网格 / 接口失败降级 / 空态 */}
          {loadError ? (
            <div className="text-center py-24 bg-gray-50 border border-[var(--border)]" style={{ borderRadius: "12px" }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Products Unavailable</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">{loadError}</p>
              <Link
                href="/products"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-[#3E6AE1] px-5 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#3561CC]"
              >
                Retry
              </Link>
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product, index) => (
                  <div key={product.id}>
                    <ProductCard product={product} preload={index === 0} />
                  </div>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <nav aria-label="Pagination" className="flex items-center justify-center gap-2 mt-12">
                  {currentPage > 1 && (
                    <Link
                      href={`/products?page=${currentPage - 1}${categorySlug ? `&category=${categorySlug}` : ""}`}
                      className="inline-flex min-h-11 items-center rounded-xl border border-black/10 bg-white px-5 py-2.5 text-[15px] font-medium text-[var(--graphite)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-3 py-2.5 text-[15px] font-medium" style={{ color: "var(--muted-foreground)" }}>
                    Page {currentPage} / {pagination.totalPages}
                  </span>
                  {currentPage < pagination.totalPages && (
                    <Link
                      href={`/products?page=${currentPage + 1}${categorySlug ? `&category=${categorySlug}` : ""}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-5 py-2.5 text-[15px] font-medium text-[var(--graphite)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    >
                      Next <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </nav>
              )}
            </>
          ) : (
            <div className="text-center py-24 bg-gray-50 border border-[var(--border)]" style={{ borderRadius: "12px" }}>
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Yet</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Our catalog is being updated — please check back soon or contact us for the latest product list.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
