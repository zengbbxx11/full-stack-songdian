import sanitizeHtml from "sanitize-html";
import { decodeHtmlEntities } from "./display-text";
import { PRIORITY_PRODUCT_SLUGS } from "./priority-products";
import type { WCProductCategory } from "./types";

export type ProductLink = { id: number; slug: string; name: string; sku?: string | null; categories: WCProductCategory[] };

export function selectNewsProducts(html: string, products: ProductLink[]) {
  const content = decodeHtmlEntities(sanitizeHtml(html, { allowedTags: ["p", "br", "div", "li", "h1", "h2", "h3", "h4", "td", "th", "section"], allowedAttributes: {} }).replace(/<[^>]+>/g, " ")).toLowerCase();
  const tokens = new Set(content.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || []);
  const eligible = products.filter(p => p.categories[0]?.slug);
  const mentioned = eligible.filter(product => {
    // CMS names may use a different model from the URL (e.g. DC106Y at /dc106).
    const firstName = product.name.trim().split(/[\s|]+/)[0];
    const aliases = [product.slug, product.sku, firstName].filter((value): value is string => Boolean(value && /[a-z]/i.test(value) && /[0-9]/.test(value)));
    return aliases.some(alias => tokens.has(alias.toLowerCase()));
  });
  const priority = PRIORITY_PRODUCT_SLUGS.flatMap(slug => eligible.filter(p => p.slug.toLowerCase() === slug));
  return (mentioned.length ? mentioned : priority).filter((p, i, all) => all.findIndex(other => other.id === p.id) === i).slice(0, 3);
}
