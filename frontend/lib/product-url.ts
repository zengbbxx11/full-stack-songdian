import type { ProductSummary, ProductDetail } from "@/lib/types";

/**
 * 产品详情页规范路径（含分类前缀，利于 SEO）。
 * 例：/products/action-camera/860a
 *
 * 当前全部产品均带分类；若 categories 为空（兜底场景），回退为 /products/{slug}。
 * 在 ProductCard、sitemap 等处统一调用，避免散落的字符串拼接走样。
 */
export function productPath(
  product: Pick<ProductSummary, "slug" | "categories"> | Pick<ProductDetail, "slug" | "categories">,
): string {
  const cat = product.categories?.[0]?.slug;
  return cat ? `/products/${cat}/${product.slug}` : `/products/${product.slug}`;
}
