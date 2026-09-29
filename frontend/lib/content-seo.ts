import sanitizeHtml from "sanitize-html";
import { decodeHtmlEntities } from "@/lib/display-text";
import { COMPANY, CATEGORY_SHOWCASE } from "@/lib/content-data";
import type { PostDetail, ProductDetail, WCProductCategory } from "@/lib/types";

export function seoText(value?: string | null): string {
  const text = sanitizeHtml((value || "").replace(/<\/(?:p|div|li|h[1-6]|tr|td|th)>|<br\s*\/?>/gi, " "), { allowedTags: [], allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "option"],
    // Preserve boundaries between paragraphs and specification cells.
  });
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

export function seoExcerpt(value: string, limit = 160): string {
  const text = seoText(value);
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary > limit * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd() + "…";
}

// Use the current category, never a per-model table or guessed camera specification.
export function productSeo(product: Pick<ProductDetail, "name" | "categories" | "shortDescription" | "description" | "attributes" | "seoTitle" | "seoDescription">) {
  const name = seoText(product.name);
  const type = seoText(product.categories[0]?.name).replace(/Cameras$/i, "Camera").replace(/Camcorders$/i, "Camcorder").replace(/Lenses$/i, "Lens");
  const modelOnly = /^[a-z0-9][a-z0-9._-]{0,39}$/i.test(name);
  const baseName = (!name || modelOnly) && type ? [name, type].filter(Boolean).join(" ") : name;
  const zoom = product.attributes.find(a => /^optical zoom$/i.test(seoText(a.name)) && /^\d+(?:\.\d+)?\s*[x×]$/i.test(seoText(a.value)));
  const namedZoom = product.attributes.find(a => /^(?:optical )?zoom$/i.test(seoText(a.name)) && /^(?:up to )?\d+(?:\.\d+)?\s*[x×] optical zoom$/i.test(seoText(a.value)));
  const detail = zoom ? seoText(zoom.value) + " Optical Zoom" : seoText(namedZoom?.value);
  const automaticTitle = detail && !baseName.toLowerCase().includes(detail.toLowerCase()) ? baseName + " — " + detail : baseName;
  const facts = seoText(product.shortDescription) || product.attributes.map(a => seoText(a.name) + ": " + seoText(a.value)).join("; ") || seoText(product.description);
  return {
    title: seoText(product.seoTitle) || automaticTitle || COMPANY.tagline,
    description: seoText(product.seoDescription) || seoExcerpt([baseName, facts, "OEM/ODM manufacturing by " + COMPANY.name + "."].filter(Boolean).join(". ")),
  };
}

export function newsSeo(post: Pick<PostDetail, "title" | "excerpt" | "content" | "seoTitle" | "seoDescription">) {
  return {
    title: seoText(post.seoTitle) || seoText(post.title) || "Camera Manufacturing News",
    description: seoText(post.seoDescription) || seoExcerpt(seoText(post.excerpt) || seoText(post.content) || post.title + " — camera manufacturing insights from " + COMPANY.name + "."),
  };
}

export function categorySeo(category: WCProductCategory) {
  const name = seoText(category.name);
  return {
    title: name + " Manufacturer | OEM & ODM",
    description: seoExcerpt((CATEGORY_SHOWCASE[category.slug]?.description ? name + " from " + COMPANY.name + ". " + CATEGORY_SHOWCASE[category.slug].description + " OEM/ODM projects welcome." : "") || "Explore " + name.toLowerCase() + " from " + COMPANY.name + ". Compare available models and specifications for OEM, ODM and wholesale projects."),
  };
}
