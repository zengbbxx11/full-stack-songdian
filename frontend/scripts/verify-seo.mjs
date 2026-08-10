import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const checks = [
  ["app/layout.tsx", ["metadataBase:", "openGraph:", "robots:", "canonical:"]],
  ["app/robots.ts", ["sitemap:", "userAgent:"]],
  ["app/sitemap.ts", ["getAllProductSlugEntries", "getAllPostSlugs"]],
  ["app/news/[slug]/page.tsx", ["alternates: { canonical:", "openGraph:"]],
  ["app/products/[...slug]/page.tsx", ["alternates: { canonical", "openGraph:"]],
];

const missing = [];
for (const [file, fragments] of checks) {
  const content = readFileSync(resolve(file), "utf8");
  for (const fragment of fragments) {
    if (!content.includes(fragment)) missing.push(`${file}: ${fragment}`);
  }
}

if (missing.length) {
  console.error("SEO contract check failed:\n" + missing.join("\n"));
  process.exit(1);
}

console.log("SEO contract check passed.");
