/*
 * 文件：app/products/[...slug]/page.tsx（产品详情 · 兼容 catch-all 路由）
 * 规范地址：/products/{categorySlug}/{slug}（如 /products/action-camera/860a）
 * 兼容旧地址：/products/{slug}（如 /products/860a）→ 308 重定向到规范嵌套地址。
 *
 * 采用 catch-all [...slug] 同时承载「2 段规范地址」与「1 段旧地址」，
 * 因为 Next.js 不允许同级出现 [slug] 与 [category] 两个不同名的动态段。
 *
 * 数据来源：
 *   - getProductBySlug(slug) → 单个产品（按 slug 唯一查找，含后台手选的关联产品）
 *   - getAllProductSlugEntries() → 产品 slug + 主分类 slug（用于 SSG 预渲染）
 * 渲染方式：Async Server Component + ISR（revalidate = 60 秒）+ generateStaticParams 预生成。
 * 是否含 client 组件：是 —— ProductGallery 为客户端交互组件。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug, getAllProductSlugEntries } from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import { productPath } from "@/lib/product-url";
import type { ProductSummary } from "@/lib/types";
import Breadcrumbs from "@/components/Breadcrumbs";
import ProductCard from "@/components/ProductCard";
import ProductGallery from "@/components/ProductGallery";
import { Badge } from "@/components/ui/badge";
import { CtaButton } from "@/components/CtaButton";
import { ProductViewTracker } from "@/components/ProductViewTracker";
import ProductDetailImages from "@/components/ProductDetailImages";
import { MEDIA } from "@/lib/media";
import { generateBreadcrumbs, productSchema, safeJsonLd } from "@/lib/seo";
import { PRIORITY_PRODUCT_SEO } from "@/lib/priority-products";
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

// 动态生成该产品的 SEO 元信息（title / description / canonical / Open Graph / Twitter）
// 注意：不显式写 twitter 时，X 会回退到根布局的默认横幅而非产品图（已实测确认缺口）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: segments } = await params;
  // 取最后一段作为产品 slug（兼容 1 段旧地址与 2 段规范地址）
  const productSlug = segments[segments.length - 1];
  let product;
  try {
    product = await getProductBySlug(productSlug);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // 元数据失败不应抢先终止正文；页面会渲染可重试的服务不可用状态。
    return {
      title: "Product Temporarily Unavailable",
      // 显式声明 canonical：否则会继承 layout 的首页 canonical（把故障页当成首页的重复内容）
      alternates: { canonical: `/products/${productSlug}` },
      robots: { index: false, follow: false },
    };
  }
  if (!product) return { title: "Product Not Found" };
  // canonical 始终以产品真实主分类为准，避免 URL 分类段拼写偏差导致标签错乱
  const canonical = productPath(product);
  const plainDesc = stripHtml(product.shortDescription || "");
  // SEO 标题 & 描述：优先使用后端 seo_* 字段（运营精修），空则回退 title/shortDescription
  const editorial = PRIORITY_PRODUCT_SEO[product.slug];
  const seoTitle = product.seoTitle || editorial?.title || product.name;
  const factoryDescription = `${product.name}, manufactured by ${COMPANY.name}, an OEM/ODM digital camera factory.${plainDesc ? ` ${plainDesc}` : ""}`;
  const seoDesc = product.seoDescription || editorial?.description || factoryDescription.slice(0, 160).trim();
  const socialImage = product.images?.[0]?.src || MEDIA.ogImage;

  return {
    title: seoTitle,
    description: seoDesc,
    alternates: { canonical },
    openGraph: {
      title: seoTitle,
      url: canonical,
      description: seoDesc,
      images: [{ url: socialImage, width: product.images?.[0]?.src ? 800 : 1200, height: product.images?.[0]?.src ? 800 : 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDesc,
      images: [socialImage],
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
// 相关产品 — 完全由后台手选（单向、最多 4 个）。
// 关联列表随详情接口一起返回，因此这里同步渲染、无额外请求；
// 未配置关联的产品不渲染该区块（旧「同分类自动取 4 条」逻辑已下线）。
// ============================================================

function RelatedProducts({ related }: { related: ProductSummary[] }) {
  return (
    <section className="py-14 md:py-20" style={{ backgroundColor: "var(--muted)" }}>
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

function ProductUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--muted)]">
        <svg className="h-8 w-8 text-[#8E8E8E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="mb-3 text-2xl font-bold text-[var(--foreground)]">Product information is temporarily unavailable</h1>
      <p className="mb-8 max-w-md text-sm text-[var(--muted-foreground)]">
        We could not load this product right now. Please try again in a moment.
      </p>
      <div className="flex gap-3">
        <a href={retryHref} className="inline-flex h-[42px] items-center rounded bg-[#3E6AE1] px-6 text-sm font-medium text-white transition-colors hover:bg-[#3561CC]">
          Try again
        </a>
        <Link href="/products" className="inline-flex h-[42px] items-center rounded border border-[#D0D1D2] px-6 text-sm font-medium text-[var(--graphite)] transition-colors hover:bg-[var(--muted)]">
          Browse Products
        </Link>
      </div>
    </div>
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
    let product;
    try {
      product = await getProductBySlug(productSlug);
    } catch (error) {
      if (error instanceof ApiError) {
        return <ProductUnavailable retryHref={`/products/${segments.join("/")}`} />;
      }
      throw error;
    }

    if (!product) notFound();

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


    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
        <ProductViewTracker productName={product.name} productSlug={product.slug} />

        {/* 面包屑导航 */}
        <section className="border-b border-white/10 bg-[var(--surface-dark)] py-5">
          <div className="site-container">
            <Breadcrumbs items={breadcrumbs} variant="dark" />
          </div>
        </section>

        {/* 产品概览 */}
        <section className="bg-white py-8 md:py-16">
          <div className="site-container">
            {/* 移动端（<lg）：右栏用 max-lg:contents 把包裹层「摊平」（display:contents 不生成盒子），
                其子元素直接成为本单列 grid 的 item，于是可以按 order 排出
                「型号 → 图集 → 简介 + 按钮」的顺序，让访客一屏内先看到产品主图。
                桌面端（lg 起）包裹层恢复为普通块，order 失效，布局/order/sticky 与改版前完全一致。 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">

              {/* 右栏：产品信息 */}
              <div className="max-lg:contents lg:order-2 lg:sticky lg:top-28 lg:self-start">
                {/* 块 1（移动端顺序 1）：型号区 */}
                <div className="order-1">
                  <p className="section-eyebrow mb-4">Product Model</p>
                  <h1 className="mb-6 text-[clamp(2.7rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-[var(--surface-dark)]">
                    {product.name}
                  </h1>

                  {product.sku && (
                    <p className="text-xs text-gray-400 mb-5">
                      SKU: <span className="font-mono text-gray-500">{product.sku}</span>
                    </p>
                  )}
                </div>

                {/* 块 3：简介要点 + 行动号召 + OEM 说明（移动端 flex + order 重排，桌面顺序不变）。
                    移动端顺序 = 按钮 → 简介 → OEM：主图占位后，需把转化入口提到简介之前，
                    询盘按钮才能仍落在首屏（390×844 下按钮底部 <650px，见 e2e/product-news-upgrade.spec.ts）；
                    简介要点与改版前一致（默认展开、无需点击），移动端显示前 3 条、
                    桌面最多 8 条（extractFeatures 的既有口径）。规格仍由下方 Specifications 表承载。 */}
                <div className="order-3 flex flex-col">
                  {features.length > 0 && (
                    <ul className="order-2 mb-7 space-y-2.5 lg:order-1">
                      {features.map((feature, i) => (
                        <li
                          key={i}
                          className={`${i >= 3 ? "hidden md:flex" : "flex"} items-start gap-3 text-[14px] leading-relaxed text-gray-600`}
                        >
                          <span aria-hidden="true" className="mt-1 shrink-0 text-gray-400">&bull;</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 行动号召按钮（移动端 order-1：排在简介之前把转化入口提到首屏；
                      两个按钮并排一行：flex-nowrap + 收紧内边距与字号，省掉换行那一行的高度。
                      返回链接 min-w-0 + truncate，优先保证主按钮不被压缩；lg 起还原桌面样式） */}
                  <div className="order-1 mb-8 flex flex-nowrap items-stretch gap-2 lg:order-2 lg:flex-wrap lg:gap-3">
                    <CtaButton
                      href={`/contact?product=${encodeURIComponent(product.slug)}&category=${encodeURIComponent(primaryCategory?.slug || "")}`}
                      ctaLabel="Product Detail - Send Inquiry"
                      className="h-12 shrink-0 border-[var(--accent)] bg-white px-4 text-[13px] text-[var(--foreground)] hover:text-white lg:px-8 lg:text-[14px]"
                    >
                      Send Inquiry
                    </CtaButton>
                    <Link
                      href={primaryCategory ? `/products?category=${primaryCategory.slug}` : "/products"}
                      className="inline-flex min-w-0 items-center rounded-xl border border-gray-200 px-3 py-3 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 max-lg:h-12 lg:px-6 lg:text-sm"
                    >
                      <span className="truncate">&larr; {primaryCategory ? `Back to ${primaryCategory.name}` : "All Products"}</span>
                    </Link>
                  </div>

                  {/* OEM/ODM 说明 */}
                  <div className="order-3 flex items-center gap-2.5 rounded-xl border border-[var(--accent)]/15 bg-[var(--accent)]/5 p-4">
                    <svg className="w-5 h-5 shrink-0 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-[var(--graphite)]">
                      Available for OEM/ODM — wholesale pricing upon request
                    </span>
                  </div>
                </div>
              </div>
              {/* 左栏：产品图集（移动端 order-2：夹在型号与行动号召之间；桌面端回到 order-1 居左）。
                  移动端缩略图条叠加进主图（省下 76px 纵向空间），主图限高从 180px 提到 260px：
                  产品主图都是 1:1 正方形，抬高容器即等比放大照片（180→260），
                  而「询盘按钮底部 = 372 + 图高」仍满足 <650px 的首屏约束（260 → 约 632px）。
                  640–1023px 组件本就是左缩略图列，不受高度占用影响，保持 300px。 */}
              <div className="order-2 lg:order-1">
                {primaryImage ? (
                  <>
                    <ProductGallery
                      mainImage={primaryImage}
                      mainAlt={product.images?.[0]?.alt || product.name}
                      gallery={galleryImages}
                      // 移动端：左侧主图 260 + 右侧竖排 56px 缩略图（不遮挡主图、也不额外占高）
                      thumbsSideOnMobile
                      mainImageClassName="max-sm:h-[260px] sm:max-lg:h-[300px]"
                      // 主图容器是 aspect-square + 高度上限 ⇒ 实际渲染成正方形（260×260 / 300×300），
                      // 所以 sizes 要按「图高」声明；沿用按容器宽度声明的默认值会选到约 1.8 倍大的候选图
                      // （e2e/responsive-images.spec.ts 的响应式选图断言会因此判为过量下载）。
                      mainImageSizes="(max-width: 639px) min(100vw - 32px, 260px), (max-width: 1023px) min(100vw - 128px, 300px), (max-width: 1311px) calc(55vw - 159px), 564px"
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
                  <div className="aspect-square mx-auto max-sm:h-[260px] sm:max-lg:h-[300px] bg-gray-50 border border-[var(--border)] flex items-center justify-center text-gray-300" style={{ borderRadius: "12px" }}>
                    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                  </div>
                )}
              </div>


            </div>
          </div>
        </section>

        {/* 规格参数 */}
        {specs.length > 0 && (
          <section className="section-shell bg-[var(--surface-soft)]">
            <div className="site-container max-w-5xl">
              <p className="section-eyebrow">Technical overview</p>
              <h2 className="section-title mb-10 mt-4">Specifications</h2>
              <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white">
                <table className="w-full">
                  <tbody>
                    {specs.map((spec, i) => (
                      <tr key={i} className="border-b border-[var(--border)] last:border-0">
                        {spec.label ? (
                          <>
                            <th scope="row" className="w-[35%] min-w-32 border-r border-[var(--border)] bg-gray-50/50 px-4 py-3.5 text-left text-sm font-medium text-gray-500 md:px-6">
                              {spec.label}
                            </th>
                            <td className="min-w-48 px-4 py-3.5 text-sm text-gray-900 md:px-6">{spec.value}</td>
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

        <ProductDetailImages html={product.description || ""} name={product.name} />

        {/* 相关产品 — 后台手选（单向、最多 4 个）；未配置关联的产品不渲染该区块 */}
        {product.related.length > 0 && <RelatedProducts related={product.related} />}
      </>
    );
  }

  // 非法段数（>2）直接 404
  notFound();
}
