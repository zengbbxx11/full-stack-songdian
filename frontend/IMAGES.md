# 图片资源替换指南 — Songdian Technology

> 🎯 **所有图片通过 WordPress + FileBird 管理，修改 `lib/media.ts` 一个文件即可全局生效。**

---

## 🔧 替换流程（最快 30 秒）

```
1. FileBird 中上传图片到 WordPress 媒体库
2. 复制图片的完整 URL（如 http://localhost:10004/wp-content/uploads/2026/07/xxx.webp）
3. 打开 lib/media.ts，粘贴到对应字段
4. 保存 → 全站自动更新
```

**不用改任何组件代码。** Header、Footer、Hero、SEO、OG 图全部从 `lib/media.ts` 读取。

---

## 📋 当前图片清单（在 lib/media.ts 中配置）

| 字段 | 用途 | 涉及组件 |
|------|------|---------|
| `MEDIA.logo` | 全站 Logo | Header, Footer, SEO JSON-LD |
| `MEDIA.heroBanner` | 首页 Hero Banner | HeroSection |
| `MEDIA.ogImage` | 社交媒体分享预览图 | layout.tsx, superMeta |
| `MEDIA.icons.*` | 卡片图标（待启用） | 首页/服务页面 |

---

## 📁 FileBird 建议文件夹结构

```
2026/06/  banner.webp        ← 当前 SMT 产线图
2026/07/  logo.png           ← 公司 Logo（GD 红色）
          og-image.jpg       ← 社交分享图 1200×630
```

---

## 📦 WordPress 自动管理的图片（无需手动操作）

| 来源 | 说明 |
|------|------|
| 文章特色图片 | WP 后台文章编辑 → 设置特色图片 |
| 文章正文图片 | Gutenberg 编辑器直接插入 |
| 产品主图/图库 | WooCommerce 产品编辑页上传 |

---

## 🗺️ Google 地图

`app/contact/page.tsx` 第 126 行 — 需替换为你的真实 Google Maps 嵌入 URL。
