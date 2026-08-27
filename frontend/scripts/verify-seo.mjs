import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const sourceChecks = [
  ["app/layout.tsx", ["metadataBase:", "openGraph:", "twitter:", "robots:", "canonical:", "width: 1200", "height: 630"]],
  ["app/robots.ts", ["sitemap:", "userAgent:"]],
  ["app/sitemap.ts", ["getAllProductSlugEntries", "getAllPostSlugs"]],
  ["app/news/[slug]/page.tsx", ["alternates: { canonical:", "openGraph:", "twitter:", "MEDIA.ogImage", "images: [socialImage]"]],
  ["app/products/[...slug]/page.tsx", ["alternates: { canonical", "openGraph:", "twitter:", "MEDIA.ogImage", "images: [socialImage]"]],
  ["app/llms.txt/route.ts", ["Content-Type\": \"text/plain; charset=utf-8", "COMPANY.established", "COMPANY.parentName", "Group manufacturing roots", "Generated:"]],
  ["next.config.ts", ["process.env.ALLOW_LOCAL_IMAGE_OPTIMIZATION === \"true\""]],
  [".env.example", ["ALLOW_LOCAL_IMAGE_OPTIMIZATION=false", "生产环境必须保持 false"]],
  [".gitignore", ["!/public/Video/factory-poster.webp"]],
  ["Dockerfile", ["public/Video/SongdianFactoryVideo.mp4", "public/Video/factory-poster.webp", "public/og/og-default.jpg"]],
];

const missing = [];
for (const [file, fragments] of sourceChecks) {
  const path = resolve(file);
  if (!existsSync(path)) {
    missing.push(`${file}: file missing`);
    continue;
  }
  const content = readFileSync(path, "utf8");
  for (const fragment of fragments) {
    if (!content.includes(fragment)) missing.push(`${file}: ${fragment}`);
  }
}

const contentData = readFileSync(resolve("lib/content-data.ts"), "utf8");
if (!contentData.includes("established: 2023") || !contentData.includes("founded: 2006")) {
  missing.push("lib/content-data.ts: legal-entity/group year contract");
}

const assets = [
  { file: "public/og/og-default.jpg", width: 1200, height: 630, maxBytes: 250_000 },
  { file: "public/Video/factory-poster.webp", width: 1600, height: 900, maxBytes: 250_000 },
];

for (const asset of assets) {
  const path = resolve(asset.file);
  if (!existsSync(path)) {
    missing.push(`${asset.file}: file missing`);
    continue;
  }

  const metadata = await sharp(path).metadata();
  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    missing.push(`${asset.file}: expected ${asset.width}x${asset.height}, got ${metadata.width}x${metadata.height}`);
  }
  const bytes = statSync(path).size;
  if (bytes > asset.maxBytes) {
    missing.push(`${asset.file}: expected <= ${asset.maxBytes} bytes, got ${bytes}`);
  }
}

if (missing.length) {
  console.error("SEO/GEO contract check failed:\n" + missing.join("\n"));
  process.exit(1);
}

console.log("SEO/GEO contract check passed (metadata, llms.txt, config, and social assets).\n");
