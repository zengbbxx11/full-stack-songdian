import fs from "node:fs";
import path from "node:path";

/**
 * lib/exhibitions.ts —— 展会图片中枢
 * ------------------------------------------------------------------
 * 从 public/Exhibitions 目录动态读取展会图片。
 * 文件名即「展会名称 + 年份」，例如：
 *   - "CES 2025.webp"              → name: "CES",            year: "2025"
 *   - "China (South Africa) Trade Fair 2024.webp"
 *                                  → name: "China (South Africa) Trade Fair", year: "2024"
 *   - "The Photography & Video Show 2025.webp"
 *                                  → name: "The Photography & Video Show", year: "2025"
 *
 * 设计要点：
 *   - 纯 fs 读取，无任何「写死」的图片列表，因此往文件夹里
 *     增 / 删 / 改图片后，首页会在下一次 ISR 重新生成（默认 60s）时
 *     自动同步，无需改代码、无需重新部署构建。
 *   - 文件名中的空格与 & 通过 encodeURIComponent 编码，保证 URL 合法。
 *   - 读取失败（目录不存在等）时返回空数组，由调用方渲染空状态。
 */

export interface Exhibition {
  /** 静态资源访问路径（已编码，可直接作为 <img src> / next/image src） */
  src: string;
  /** 无障碍 alt 文本 */
  alt: string;
  /** 展会名称（文件名去掉末尾年份） */
  name: string;
  /** 年份（文件名末尾的 4 位数字） */
  year: string;
}

const EXHIBITIONS_DIR = path.join(process.cwd(), "public", "Exhibitions");

const IMAGE_EXTENSIONS = new Set([
  ".webp",
  ".jpg",
  ".jpeg",
  ".png",
  ".avif",
  ".gif",
  ".svg",
]);

/** 从文件名（不含扩展名）中解析「名称 + 年份」 */
function parseNameYear(base: string): { name: string; year: string } {
  // 匹配末尾的 4 位数字年份，前面为名称
  const match = base.match(/(.*?)\s+(\d{4})\s*$/);
  if (match) {
    return { name: match[1].trim(), year: match[2] };
  }
  // 文件名不含年份时，整体作为名称
  return { name: base.trim(), year: "" };
}

/**
 * 读取 public/Exhibitions 下所有图片，按文件名排序返回。
 * 同步函数，适用于 Server Component（首页为 async Server Component + ISR）。
 */
export function getExhibitions(): Exhibition[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(EXHIBITIONS_DIR);
  } catch {
    // 目录不存在或不可读 —— 返回空，由页面渲染空状态
    return [];
  }

  return files
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const base = path.basename(file, path.extname(file));
      const { name, year } = parseNameYear(base);
      const src = `/Exhibitions/${encodeURIComponent(file)}`;
      const alt = [name, year, "exhibition booth"]
        .filter(Boolean)
        .join(" ");
      return { src, alt, name, year };
    });
}
