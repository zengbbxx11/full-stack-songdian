import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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

// ── next-super-meta 入口契约 ────────────────────────────────────────────────
// 站点 URL 是 next-super-meta 的模块级状态：初始化必须与 superMeta 调用点处于同一模块图，
// 否则缺 NEXT_PUBLIC_SITE_URL 时页面级 description / canonical 会静默消失（2026-09-17 CI 事故）。
// 因此入口统一为 lib/site-meta.ts，其它位置不得直接从 "next-super-meta" 导入。
const superMetaEntry = "lib/site-meta.ts";
const superMetaEntryPath = resolve(superMetaEntry);
if (!existsSync(superMetaEntryPath)) {
  missing.push(`${superMetaEntry}: file missing`);
} else {
  const entry = readFileSync(superMetaEntryPath, "utf8");
  for (const fragment of ["initSuperMeta({", "siteUrl: SITE_URL", "export { superMeta }"]) {
    if (!entry.includes(fragment)) missing.push(`${superMetaEntry}: ${fragment}`);
  }
}

const walkSources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  if (entry.isDirectory()) return walkSources(full);
  return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
});

for (const dir of ["app", "lib", "components"]) {
  const root = resolve(dir);
  if (!existsSync(root)) continue;
  for (const file of walkSources(root)) {
    const rel = relative(resolve("."), file).split("\\").join("/");
    if (rel === superMetaEntry) continue;
    if (readFileSync(file, "utf8").includes('from "next-super-meta"')) {
      missing.push(`${rel}: import superMeta from "@/lib/site-meta" instead of "next-super-meta"`);
    }
  }
}

if (missing.length) {
  console.error("SEO/GEO contract check failed:\n" + missing.join("\n"));
  process.exit(1);
}

console.log("SEO/GEO contract check passed (metadata, llms.txt, config, and social assets).\n");
