// Shared URL and indexing policy. Keep this module independent of rendering and CMS data.
export const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
if (!/^https?:/.test(SITE_URL)) throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin");

export function absoluteSiteUrl(path = "/"): string {
  const url = new URL(path, SITE_URL);
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

// Explicit opt-in: NODE_ENV=production also describes staging builds.
// Set the same value at build and runtime; runtime response headers protect cached HTML.
export function isSiteIndexable(): boolean {
  return process.env.SEO_INDEXABLE === "true";
}

export function pageRobots(index = true) {
  const allowed = isSiteIndexable() && index;
  return {
    index: allowed,
    follow: true,
    googleBot: { index: allowed, follow: true, "max-image-preview": "large" as const },
  };
}
