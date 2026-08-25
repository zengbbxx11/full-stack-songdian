/**
 * Normalize legacy CMS text before it reaches public-facing components.
 * Source records are corrected by a data migration as well; these guards keep
 * imported or stale cached content from reintroducing the same presentation bugs.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}

export function normalizeCategoryName(value: string): string {
  return normalizePublicText(value).replace(/\bAction Ccamera\b/gi, "Action Camera");
}

export function normalizePublicText(value: string): string {
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
export function normalizePublicSummary(value: string): string {
  return normalizePublicText(value.replace(/<[^>]*>/g, " "))
    .replace(/interpolation）/gi, "interpolation")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
