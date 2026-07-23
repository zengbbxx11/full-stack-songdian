/*
 * 文件：app/products/[slug]/page.tsx（产品详情 / Product Detail）
 * 职责：单个产品详情页，含画廊、特性、规格表、产品亮点、相关产品与 JSON-LD（productSchema）。
 * 数据来源（WP REST API）：
 *   - getProductBySlug(slug) → 单个产品
 *   - getAllProductSlugs()   → 产品 slug 列表（用于 SSG 预渲染）
 *   - getProducts()          → 同类相关产品
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）+ generateStaticParams 预生成。
 * 是否含 client 组件：是 —— ProductGallery 为客户端交互组件。
 */

import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getProductBySlug, getAllProductSlugs, getProducts } from "@/lib/api/products";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import { Badge } from "@/components/ui/badge";
import { cleanPostContent } from "@/lib/html-cleaner";
import { generateBreadcrumbs, productSchema, safeJsonLd } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";

// ISR 重新验证间隔（秒）：每 60 秒重新生成产品详情
export const revalidate = 60;

// 预生成所有产品静态路径（SSG）：从 WP 拉取全部产品 slug
export async function generateStaticParams() {
  const slugs = await getAllProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

// 动态生成该产品的 SEO 元信息（title / description / canonical / Open Graph）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };
  return {
    title: product.name,
    description: product.shortDescription?.slice(0, 160) || `OEM/ODM ${product.name} — ${COMPANY.name}`,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title: product.name,
      description: product.shortDescription?.slice(0, 160),
      images: product.images?.[0]?.src ? [{ url: product.images[0].src, width: 800, height: 800 }] : [],
      type: "article",
    },
  };
}

// 从产品短描述 HTML 中提取要点列表（去标签、去项目符号）
function extractFeatures(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((s) => s.replace(/^[•\-–—·]\s*/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 8);
}

// 从产品短描述 HTML 中提取规格行（短行视为规格条目）
function extractSpecs(html: string): { label: string; value: string }[] {
  const lines = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const specs: { label: string; value: string }[] = [];
  for (const line of lines) {
    if (line.length < 60) specs.push({ label: "", value: line });
  }
  return specs.slice(0, 16);
}

// ============================================================
// 相关产品 — 独立 async 组件，Suspense 流式到达，不阻塞主内容
// ============================================================

async function RelatedProducts({ categoryId, currentProductId }: { categoryId: number; currentProductId: number }) {
  const { products } = await getProducts({ category: categoryId, perPage: 4 }).catch(() => ({ products: [], pagination: null }));
  const related = products.filter((p) => p.id !== currentProductId).slice(0, 4);

  if (related.length === 0) return null;

  return (
    <section className="py-14 md:py-20" style={{ backgroundColor: "#F4F4F4" }}>
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-8">Related Products</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {related.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RelatedProductsSkeleton() {
  return (
    <section className="py-14 md:py-20" style={{ backgroundColor: "#F4F4F4" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-8 w-48 rounded animate-pulse bg-[#E5E5E5] mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="aspect-square rounded-xl animate-pulse bg-[#E5E5E5]" style={{ animationDelay: `${i * 0.1}s` }} />
              <div className="h-4 w-3/4 rounded animate-pulse bg-[#E5E5E5]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
        <Link href="/products" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          &larr; Back to Products
        </Link>
      </div>
    );
  }

  // 主分类（用于面包屑 + 返回按钮，回到对应分类列表）
  const primaryCategory = product.categories[0];

  const breadcrumbs = generateBreadcrumbs([
    { label: "Products", href: "/products" },
    ...(primaryCategory
      ? [{ label: primaryCategory.name, href: `/products?category=${primaryCategory.slug}` }]
      : []),
    { label: product.name },
  ]);

  const schema = productSchema({
    name: product.name,
    description: product.shortDescription?.slice(0, 160) || "",
    image: product.images?.[0]?.src || null,
    sku: product.sku,
    url: `/products/${slug}`,
  });

  const features = product.shortDescription ? extractFeatures(product.shortDescription) : [];

  const wcAttrs = product.attributes || [];
  const parsedSpecs = product.shortDescription ? extractSpecs(product.shortDescription) : [];
  const specs = wcAttrs.length > 0
    ? wcAttrs.map((a) => ({ label: a.name, value: a.value }))
    : parsedSpecs;

  const primaryImage = product.images?.[0]?.src || null;
  const galleryImages = product.gallery || [];
  const hasContent = product.description && product.description.trim().length > 0;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />

      {/* 面包屑导航 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      {/* 产品概览 */}
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">

            {/* 左栏：产品图集 */}
            <div>
              {primaryImage ? (
                <>
                  <ProductGallery
                    mainImage={primaryImage}
                    mainAlt={product.images?.[0]?.alt || product.name}
                    gallery={galleryImages}
                    category={product.categories[0]?.name}
                  />
                  {/* 产品标签 — 放在大图下方；沿用 Tesla 设计语言（Light Ash 底 / Pewter 字、无阴影） */}
                  {product.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {product.tags.map((tag) => (
                        <Badge variant="secondary" key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="aspect-square bg-gray-50 border border-[#EEEEEE] flex items-center justify-center text-gray-300" style={{ borderRadius: "12px" }}>
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                </div>
              )}
            </div>

            {/* 右栏：产品信息 */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Product Model</p>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight mb-5">
                {product.name}
              </h1>

              {features.length > 0 && (
                <ul className="space-y-2.5 mb-7">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-[14px] text-gray-600 leading-relaxed">
                      <span className="text-gray-400 mt-1 shrink-0">&bull;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {product.sku && (
                <p className="text-xs text-gray-400 mb-5">
                  SKU: <span className="font-mono text-gray-500">{product.sku}</span>
                </p>
              )}

              {/* 行动号召按钮 */}
              <div className="flex flex-wrap gap-3 mb-8">
                <Link
                  href="/contact"
                  className="inline-flex items-center px-8 text-white text-sm font-medium rounded transition-colors bg-[#3E6AE1] hover:bg-[#3561CC]"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#FFFFFF",
                    height: "42px",
                    borderRadius: "4px",
                    transitionDuration: "0.33s",
                  }}
                >
                  Send Inquiry
                  <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href={primaryCategory ? `/products?category=${primaryCategory.slug}` : "/products"}
                  className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  &larr; {primaryCategory ? `Back to ${primaryCategory.name}` : "All Products"}
                </Link>
              </div>

              {/* OEM/ODM 说明 */}
              <div className="flex items-center gap-2.5 p-4 rounded-xl border" style={{ backgroundColor: "#EFF3FF", borderColor: "#C5D5F8" }}>
                <svg className="w-5 h-5 shrink-0" style={{ color: "#3E6AE1" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm" style={{ color: "#3561CC" }}>
                  Available for OEM/ODM — wholesale pricing upon request
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 规格参数 */}
      {specs.length > 0 && (
        <section className="py-12 md:py-16" style={{ backgroundColor: "#F4F4F4" }}>
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-8">Specifications</h2>
            <div className="bg-white overflow-hidden border border-[#EEEEEE]" style={{ borderRadius: "12px" }}>
              <table className="w-full">
                <tbody>
                  {specs.map((spec, i) => (
                    <tr key={i} className="border-b border-[#EEEEEE] last:border-0">
                      {spec.label ? (
                        <>
                          <td className="w-[35%] px-6 py-3.5 text-sm font-medium text-gray-500 bg-gray-50/50 border-r border-[#EEEEEE]">
                            {spec.label}
                          </td>
                          <td className="px-6 py-3.5 text-sm text-gray-900">{spec.value}</td>
                        </>
                      ) : (
                        <td colSpan={2} className="px-6 py-3.5 text-sm text-gray-900">{spec.value}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 产品亮点 */}
      {hasContent && (
        <section className="py-14 md:py-20 bg-white">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-8">Product Highlights</h2>
            <div className="wp-content" dangerouslySetInnerHTML={{ __html: cleanPostContent(product.description) }} />
          </div>
        </section>
      )}

      {/* 相关产品 — 流式到达，不阻塞主内容 */}
      {primaryCategory && (
        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProducts categoryId={primaryCategory.id} currentProductId={product.id} />
        </Suspense>
      )}
    </>
  );
}
