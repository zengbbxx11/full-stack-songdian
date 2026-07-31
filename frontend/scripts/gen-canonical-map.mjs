// 自动生成产品 URL 规范化映射（slug -> 规范相对路径）。
//
// 为何需要：本环境（Next.js 16 + Turbopack）下，App Router 页面组件内的
// redirect()/permanentRedirect() 不会发出真实 3xx（被框架在渲染期吞掉），
// 因此改用 middleware 边缘层做 308 重定向。middleware 需要一份「产品 slug ->
// 规范嵌套路径」的静态映射，由本脚本依据后端产品数据生成。
//
// 产物：lib/generated/canonical-map.ts
//   export const CANONICAL_MAP: Record<string, string> = {
//     "860a": "/products/action-camera/860a",
//     ...
//   };
//
// 运行：node scripts/gen-canonical-map.mjs
// 部署前务必重新生成（产品/分类变动后），并确保后端 API 可达。

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../lib/generated/canonical-map.ts");

async function main() {
  const url = `${API_URL}/api/v1/products?page=1&page_size=300&status=PUBLISHED`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`后端产品接口返回 ${res.status}：${url}`);
  }
  const root = await res.json();
  // 后端统一包装结构：{ code, msg, data: { list: [...] } }
  const data = root?.data ?? root;
  const list = Array.isArray(data?.list) ? data.list : [];

  const map = {};
  for (const p of list) {
    const slug = p?.slug;
    if (!slug) continue;
    const cat = p?.category?.slug ?? null;
    map[slug] = cat ? `/products/${cat}/${slug}` : `/products/${slug}`;
  }

  const entries = Object.keys(map)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`)
    .join("\n");

  const header =
    "// 自动生成，请勿手动编辑。由 scripts/gen-canonical-map.mjs 依据后端产品数据生成。\n" +
    "// 用途：middleware 边缘层做产品 URL 规范化 308 重定向\n" +
    "//（旧扁平 /products/{slug} → 规范 /products/{category}/{slug}）。\n";
  const content = `${header}export const CANONICAL_MAP: Record<string, string> = {\n${entries}\n};\n`;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, content, "utf8");
  console.log(`✓ 已生成 ${Object.keys(map).length} 条产品规范路径 -> ${OUT_PATH}`);
}

main().catch((e) => {
  console.error("✗ 生成规范映射失败：", e?.message || e);
  process.exit(1);
});
