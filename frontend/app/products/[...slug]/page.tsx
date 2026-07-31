/*
 * 文件：app/products/[...slug]/page.tsx（产品详情 · 兼容 catch-all 路由）
 * 规范地址：/products/{categorySlug}/{slug}（如 /products/action-camera/860a）
 * 兼容旧地址：/products/{slug}（如 /products/860a）→ 308 重定向到规范嵌套地址。
 *
 * 采用 catch-all [...slug] 同时承载「2 段规范地址」与「1 段旧地址」，
 * 因为 Next.js 不允许同级出现 [slug] 与 [category] 两个不同名的动态段。
 *
 * 数据来源：
 *   - getProductBySlug(slug) → 单个产品（按 slug 唯一查找）
 *   - getAllProductSlugEntries() → 产品 slug + 主分类 slug（用于 SSG 预渲染）
 *   - getProducts()          → 同类相关产品
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）+ generateStaticParams 预生成。
 * 是否含 client 组件：是 —— ProductGallery 为客户端交互组件。
 */

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug, getAllProductSlugEntries, getProducts } from "@/lib/api/products";
import { productPath } from "@/lib/product-url";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import { Badge } from "@/components/ui/badge";
import { CtaButton } from "@/components/CtaButton";
import { ProductViewTracker } from "@/components/ProductViewTracker";
import { cleanPostContent } from "@/lib/html-cleaner";
import { generateBreadcrumbs, productSchema, safeJsonLd } from "@/lib/seo";
import { COMPANY } from "@/lib/content-data";

// ISR 重新验证间隔（秒）：每 60 秒重新生成产品详情
export const revalidate = 60;

// 预生成所有产品静态路径（SSG）：/products/{主分类 slug}/{slug}
export async function generateStaticParams() {
  const entries = await getAllProductSlugEntries();
  return entries
    .filter((e) => e.categorySlug)
    .map((e) => ({ slug: [e.categorySlug as string, e.slug] }));
}

// 动态生成该产品的 SEO 元信息（title / description / canonical / Open Graph）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: segments } = await params;
  // 取最后一段作为产品 slug（兼容 1 段旧地址与 2 段规范地址）
  const productSlug = segments[segments.length - 1];
  const product = await getProductBySlug(productSlug);
  if (!product) return { title: "Product Not Found" };
  // canonical 始终以产品真实主分类为准，避免 URL 分类段拼写偏差导致标签错乱
  const canonical = productPath(product);
  const plainDesc = stripHtml(product.shortDescription || "").slice(0, 160);
  // SEO 标题 & 描述：优先使用后端 seo_* 字段（运营精修），空则回退 title/shortDescription
  const seoTitle = product.seoTitle || product.name;
  const seoDesc = product.seoDescription || plainDesc || `OEM/ODM ${product.name} — ${COMPANY.name}`;
  return {
    title: seoTitle,
    description: seoDesc,
    alternates: { canonical },
    openGraph: {
      title: seoTitle,
      description: seoDesc,
      images: product.images?.[0]?.src ? [{ url: product.images[0].src, width: 800, height: 800 }] : [],
      type: "website",
    },
  };
}

// 去除 HTML 标签并压缩空白，用于生成纯文本描述（SEO description / Schema）
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: segments } = await params;

  // URL 规范化（旧扁平 /products/{slug} 与分类段错误的地址）统一由 middleware 边缘层
  // 做 308 重定向到规范嵌套地址；本页面只负责渲染「规范两段地址」。
  // 若未命中 middleware（如映射未及时更新），这里兜底：非规范两段地址直接 404，
  // 避免产生重复内容（canonical 标签已由 generateMetadata 输出，SEO 权重不受影响）。
  if (segments.length === 1) {
    notFound();
  }

  // 规范地址 /products/{category}/{slug}（两段）
  if (segments.length === 2) {
    const [category, productSlug] = segments;
    const product = await getProductBySlug(productSlug);

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

    // 主分类（用于面包屑 + 返回按钮）
    const primaryCategory = product.categories[0];

    // 分类段与产品真实主分类不符（映射未覆盖的极端情况）→ 兜底 404，交由 middleware 处理重定向
    if (primaryCategory && primaryCategory.slug.toLowerCase() !== category.toLowerCase()) {
      notFound();
    }

    const canonical = productPath(product);

    const breadcrumbs = generateBreadcrumbs([
      { label: "Products", href: "/products" },
      ...(primaryCategory
        ? [{ label: primaryCategory.name, href: `/products?category=${primaryCategory.slug}` }]
        : []),
      { label: product.name },
    ]);

    const schema = productSchema({
      name: product.name,
      description: stripHtml(product.shortDescription || "").slice(0, 160),
      image: product.images?.[0]?.src || null,
      sku: product.sku,
      url: canonical,
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
        <ProductViewTracker productName={product.name} productSlug={product.slug} />

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
                    {/* 产品标签 — 放在大图下方 */}
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
                  <CtaButton
                    href="/contact"
                    ctaLabel="Product Detail - Send Inquiry"
                    className="border-[#d4343e] bg-white text-[#171A20] shadow-sm h-[42px] px-8 text-[14px]"
                  >
                    Send Inquiry
                  </CtaButton>
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
              <div className="article-body" dangerouslySetInnerHTML={{ __html: cleanPostContent(product.description) }} />
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

  // 非法段数（>2）直接 404
  notFound();
}
