/**
 * Normalize legacy CMS text before it reaches public-facing components.
 * Source records are corrected by a data migration as well; these guards keep
 * imported or stale cached content from reintroducing the same presentation bugs.
 *
 * 入参一律容忍 null / undefined：后端字段缺失时收敛为空字符串，而不是抛
 * TypeError 让预渲染或 SSR 失败（历史事故：normalizePublicText(undefined) → 页面 500）。
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** 把可能缺失的后端文本收敛为字符串（null / undefined / 非字符串 → ""）。 */
function asText(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

export function decodeHtmlEntities(value: string | null | undefined): string {
  return asText(value)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}

export function normalizeCategoryName(value: string | null | undefined): string {
  return normalizePublicText(value).replace(/\bAction Ccamera\b/gi, "Action Camera");
}

export function normalizePublicText(value: string | null | undefined): string {
  return decodeHtmlEntities(value)
    .replace(/Songdian;s/g, "Songdian's")
    .replace(/\bUP to\b/g, "Up to")
    .replace(/(\d(?:\.\d+)?)inch\b/gi, "$1-inch")
    .replace(/\banti shaking\b/gi, "anti-shake")
    .replace(/(\d)\s*\*\s*(\d)/g, "$1×$2")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[\t\f\v ]{2,}/g, " ")
    .trim();
}

/** Convert legacy CMS HTML snippets into compact text for cards and search. */
export function normalizePublicSummary(value: string | null | undefined): string {
  return normalizePublicText(asText(value).replace(/<[^>]*>/g, " "))
    .replace(/interpolation）/gi, "interpolation")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
