/*
 * 文件：app/products/page.tsx（产品列表 / Products）
 * 职责：产品列表页，含分类筛选、产品网格与分页。
 * 数据来源（WP REST API）：
 *   - getProducts()         → WP 产品列表（支持 page 分页与 category 筛选，每页 12 个）
 *   - getProductCategories()→ WP 产品分类（用于筛选按钮）
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）。
 * 是否含 client 组件：否。
 */

import Link from "next/link";
import type { Metadata } from "next";
import { superMeta } from "next-super-meta";
import { getProducts, getProductCategories } from "@/lib/api/products";
import ProductCard from "@/components/ProductCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbs } from "@/lib/seo";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  const slug = sp.category;
  const cats = await getProductCategories().catch(() => []);
  const cat = slug ? cats.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) : undefined;
  if (!cat) {
    return superMeta({
      title: "Camera Products",
      description: "Explore our full range of OEM / ODM digital cameras — action cameras, mirrorless cameras, point-and-shoot cameras, and more.",
      url: "/products",
    });
  }
  return superMeta({
    title: `${cat.name} — Camera Products`,
    description: `Browse our ${cat.name.toLowerCase()} — OEM / ODM digital cameras manufactured by Songdian Technology.`,
    url: `/products?category=${cat.slug}`,
  });
}

// ISR 重新验证间隔（秒）：每 60 秒重新生成产品列表，平衡实时性与性能
export const revalidate = 60;

interface ProductsPageProps {
  searchParams: Promise<{ page?: string; category?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const categorySlug = params.category || undefined;

  // 先取分类列表，再把 slug 解析为 WP 数字分类 ID（getProducts 需要 ID）
  const rawCategories = await getProductCategories().catch(() => []);
  const matchedCategory = categorySlug
    ? rawCategories.find((c) => c.slug.toLowerCase() === categorySlug.toLowerCase())
    : undefined;
  const categoryFilterId = matchedCategory?.id;

  const { products, pagination } = await getProducts({
    page: currentPage,
    perPage: 12,
    category: categoryFilterId,
  });

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
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="py-6 md:py-8 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {/* 产品分类筛选 — 等宽网格，撑满整行 */}
          {categories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
              {categories.map((cat) => {
                const isActive = !!categorySlug && categorySlug.toLowerCase() === cat.slug.toLowerCase();
                return (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.slug}`}
                    className={`flex items-center justify-center px-4 py-3 text-sm md:text-base font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#d4343e] text-white"
                        : "bg-[#F4F4F4] text-[#393C41] hover:bg-[#E5E5E5]"
                    }`}
                    style={{ transitionDuration: "0.2s" }}
                  >
                    {cat.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* 产品网格 */}
          {products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {products.map((product, i) => (
                  <div key={product.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-12">
                  {currentPage > 1 && (
                    <Link
                      href={`/products?page=${currentPage - 1}${categorySlug ? `&category=${categorySlug}` : ""}`}
                      className="px-5 py-2.5 text-sm md:text-base font-medium rounded transition-all bg-[#F4F4F4] hover:bg-[#EEEEEE]"
                      style={{
                        color: "#393C41",
                        borderRadius: "4px",
                        transitionDuration: "0.33s",
                      }}
                    >
                      Previous
                    </Link>
                  )}
                  <span className="px-4 py-2.5 text-sm" style={{ color: "#5C5E62" }}>
                    Page {currentPage} / {pagination.totalPages}
                  </span>
                  {currentPage < pagination.totalPages && (
                    <Link
                      href={`/products?page=${currentPage + 1}${categorySlug ? `&category=${categorySlug}` : ""}`}
                      className="px-5 py-2.5 text-sm md:text-base font-medium rounded transition-all bg-[#F4F4F4] hover:bg-[#EEEEEE]"
                      style={{
                        color: "#393C41",
                        borderRadius: "4px",
                        transitionDuration: "0.33s",
                      }}
                    >
                      Next
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24 bg-gray-50 border border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Yet</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Add products in WooCommerce — they will appear here automatically.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
