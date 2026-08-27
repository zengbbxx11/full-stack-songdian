/*
 * generate-og-assets.mjs — 生成品牌静态资产（sharp + SVG 叠加）
 * 产物：
 *   1. public/og/og-default.jpg      1200×630 社交分享默认图（1.91:1，不被平台裁切）
 *   2. public/Video/factory-poster.webp  1600×900 工厂视频封面
 * 设计语言与首页 Hero 一致：产线实拍 + 左深右浅渐变 + 品牌红 eyebrow + 白字。
 * 用法（frontend 目录下）：npm run generate:social-assets
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const BANNER = path.join(ROOT, "public", "banner", "banner.webp");

// 品牌色（与 globals.css :root 一致）
const RED_SOFT = "#E8555E"; // 深色底上的亮红，保证可读性
const INK = "rgba(7,9,12,"; // 与 Hero 渐变同色

// ---------- 1. OG 分享图 1200×630 ----------
const ogSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}0.94)"/>
      <stop offset="0.55" stop-color="${INK}0.72)"/>
      <stop offset="1" stop-color="${INK}0.30)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#fade)"/>
  <!-- 品牌红竖条，呼应 Hero 徽章的 border-l-2 -->
  <rect x="64" y="150" width="4" height="34" fill="${RED_SOFT}"/>
  <text x="84" y="176" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="bold"
        letter-spacing="4" fill="${RED_SOFT}">OEM &amp; ODM CAMERA MANUFACTURER</text>
  <text x="62" y="262" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="bold"
        letter-spacing="-1.5" fill="#FFFFFF">Digital Camera Manufacturing</text>
  <text x="62" y="338" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="bold"
        letter-spacing="-1.5" fill="#FFFFFF">for Global Brands</text>
  <text x="64" y="404" font-family="Arial, Helvetica, sans-serif" font-size="24"
        fill="rgba(255,255,255,0.78)">20 years · 30+ new products annually · 10M units annual output · 500+ patents</text>
  <!-- 底部字标：Logo 为深色版不适配暗底，用白色文字字标替代 -->
  <rect x="64" y="556" width="10" height="10" fill="${RED_SOFT}"/>
  <text x="86" y="567" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold"
        letter-spacing="3" fill="#FFFFFF">SONGDIAN TECHNOLOGY</text>
</svg>`;

// ---------- 2. 视频封面 1600×900（组件自带播放按钮与角标，封面保持干净） ----------
const posterSvg = `<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="vfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="${INK}0)"/>
      <stop offset="1" stop-color="${INK}0.42)"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#vfade)"/>
</svg>`;

mkdirSync(path.join(ROOT, "public", "og"), { recursive: true });

// OG 用 JPEG：照片类内容比 PNG 小约 80%，各社交平台均支持
const ogBg = await sharp(BANNER).resize(1200, 630, { fit: "cover" }).jpeg().toBuffer();
await sharp(ogBg)
  .composite([{ input: Buffer.from(ogSvg) }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(path.join(ROOT, "public", "og", "og-default.jpg"));

const posterBg = await sharp(BANNER).resize(1600, 900, { fit: "cover" }).webp().toBuffer();
await sharp(posterBg)
  .composite([{ input: Buffer.from(posterSvg) }])
  .webp({ quality: 84 })
  .toFile(path.join(ROOT, "public", "Video", "factory-poster.webp"));

console.log("generated: public/og/og-default.jpg, public/Video/factory-poster.webp");
