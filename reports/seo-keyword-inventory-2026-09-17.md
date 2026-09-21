# 关键词布局与 SEO 现状盘点（2026-09-17）

对象：Songdian Technology 官网（`frontend/`，Next.js 16 App Router，纯英文站，询盘制 B2B）。
说明：本文是**现状事实 + 证据**（均给 `文件:行号`），并在末尾列出本轮修掉的缺口与仍未处理项。

规范站点 URL：`process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"`，全仓 5 处解析、取值一致：
`lib/site-meta.ts`、`lib/seo.ts`、`app/robots.ts`、`app/sitemap.ts`、`app/llms.txt/route.ts`。

---

## 一、站点级基线

| 项 | 取值 | 来源 |
|---|---|---|
| `metadataBase` | `SITE_URL` | `app/layout.tsx` |
| title 默认值 | `Songdian Technology — Digital Camera OEM/ODM Manufacturer` | `layout.tsx` + `content-data.ts` |
| title 模板 | `%s \| Songdian Technology` | `layout.tsx` |
| 默认 description | `COMPANY.description`（20 年数码相机 OEM/ODM 工厂定位） | `content-data.ts` |
| **全局 keywords（14 条，全站继承，无逐页 keywords）** | digital camera manufacturer / OEM camera factory / ODM camera supplier / Songdian Technology / 松典相机 / compact digital camera OEM / mirrorless camera factory / action camera manufacturer / kids camera supplier / video camera OEM / custom camera development / China camera factory / B2B camera manufacturing / private label cameras | `app/layout.tsx` |
| 默认 OG 图 | `/og/og-default.jpg`（1200×630，实体文件存在） | `lib/media.ts` + `public/og/` |
| robots 默认 | `index,follow`；googleBot `max-image-preview:large`、`max-snippet:-1` | `layout.tsx` |
| GSC 验证 | `NEXT_PUBLIC_GOOGLE_VERIFICATION`，可被后台 `google_verification` 覆盖 | `layout.tsx` |
| metadata 统一入口 | `@/lib/site-meta`（内部完成 `initSuperMeta`），`npm run verify:seo` 禁止页面绕过 | `lib/site-meta.ts`、`scripts/verify-seo.mjs` |
| `<html lang>` | `en` | `layout.tsx` |

**robots.txt**：只有一条 `userAgent: "*", allow: "/"`（全站放行，**未对任何 AI 爬虫做区分**）+ sitemap 声明。

**sitemap.xml**：`unstable_cache`（60s，tags `products/news/product-categories`）；分页不完整时**抛错而不返回残缺结果**。
覆盖 8 个静态页（`/` 1.0、`/about` 0.8、`/products` 0.9、`/news` 0.9、`/solutions` 0.8、`/solutions/faq` 0.5、`/contact` 0.7、`/privacy-policy` 0.3）
+ 产品详情（带 `lastModified`）+ 新闻详情（**不带** `lastModified`，后端无更新时间字段）。
未收录：`/search`、`?category=`、`?page=`、`/preview/*`。

**`/llms.txt`**（GEO）：`revalidate=3600`，输出结构化 Markdown —— 法律实体（2023）/集团制造史（2006）、Key Facts
（员工、工厂面积、产能、专利、地址、联系方式）、Main Pages 目录，并声明该文件为社区提案、非正式标准。

---

## 二、逐页关键词布局

> 静态页为**硬编码常量**；列表/详情页为**运行时拼接**（依赖后端数据）。全站无逐页 `keywords` meta。

| 页面 | 目标关键词 | `<title>` | H1 | 小节标题（H2） | canonical | 结构化数据 |
|---|---|---|---|---|---|---|
| `/` | OEM/ODM digital camera manufacturer | `OEM/ODM Digital Camera Manufacturer & Factory` | `Digital Camera Manufacturing for Global Brands` | Cameras We Manufacture / Manufacturing Excellence / Global ODM Partners / Trade Shows We've Attended / Latest Updates | `SITE_URL` | Organization + WebSite(SearchAction) |
| `/products` | 品类词 + OEM/ODM camera products | 命中分类 → `${cat.name} for OEM & ODM` + `\| Page N`；否则 `Digital Camera Products for OEM & ODM` | 分类名 或 `Camera Products` | — | `/products?category=…`（`page=1` 去参数；越界回落首页并 noindex） | BreadcrumbList |
| `/products/[category]/[slug]` | 型号 + 品类（DC403 等） | `seo_title → 主推表(dc403/dc105/dc325/dc417x) → name` | `product.name` | Specifications / Related Products | `/products/{主分类}/{slug}`（旧/错分类由 `proxy.ts` 运行期查后端 308） | Product（brand/manufacturer 复用 `#manufacturer`，**刻意无 Offer**）+ BreadcrumbList |
| `/news` | camera manufacturing news / insights | 分类命中 → `${category.name} \| Camera Manufacturing News`；否则 `Camera Manufacturing News & Insights` + `\| Page N` | 同 title 主体 | — | `/news?category=…`（`page=1` 去参数；越界 noindex） | BreadcrumbList |
| `/news/[slug]` | 文章主题词 | `post.title` | `post.title` | More Articles / Explore cameras and manufacturing services | `/news/{slug}` | Article（作者为公司则 Organization）+ BreadcrumbList |
| `/solutions` | OEM/ODM camera solutions | `OEM & ODM Camera Solutions` | `Camera Solutions, Tailored to Your Needs` | One partner, three ways to market | `/solutions` | BreadcrumbList |
| `/solutions/faq` | camera OEM/ODM FAQ | `Camera OEM & ODM FAQ` | **H1 为本轮新增**（此前整页只有 H2） | 各 FAQ 分类名 | `/solutions/faq` | FAQPage + BreadcrumbList |
| `/about` | Songdian camera manufacturing | `About Songdian Camera Manufacturing` | `ABOUT.hero.title` = `About Songdian Technology`（**本轮由 `Our Story` 改回主题词**） | Our Journey / Take a Look Inside Our Factory / Certifications & Compliance | `/about` | BreadcrumbList |
| `/contact` | contact / request quote | `Contact Songdian Sales` | `Tell us what you want to build.` | — | `/contact` | Organization（**本轮移除页面级重复块**，全站由 layout 输出同 `@id`）+ BreadcrumbList |
| `/privacy-policy` | — | `Privacy Policy` | `Privacy Policy` | — | `/privacy-policy` | BreadcrumbList |
| `/search` | — | `Search: {q}` | `Search` | — | `/search`（显式声明，避免继承首页） | 恒定 `noindex,follow`、`force-dynamic` |
| `not-found` / `error` | — | — | `Page not found` / `Something went wrong` | — | 继承 | 404 由 Next 注入 noindex（有 e2e 断言） |
| `/preview/[token]` | — | — | — | — | — | `noindex,nofollow,nocache` |

**内链与权重流向**
- 导航（手工）：Home / Products / Solutions(下拉 OEM·ODM、FAQ) / News / About；Contact 走 `Request Quote` CTA（`components/Header.tsx`）。
- 页脚：产品列由 `PRODUCT_CATEGORIES` **自动派生**为 `/products?category=slug`，其余手工；底栏含 sitemap、隐私政策、FAQ（`lib/site-config.ts` + `components/Footer.tsx`）。
- 面包屑：全站自动生成并内联输出 BreadcrumbList JSON-LD（`lib/seo.ts` + `components/Breadcrumbs.tsx`）。
- **新闻详情底部"相关产品内链"自动生成**：按正文型号匹配，未命中回退主推 4 个 SKU，最多 3 条，再固定追加 `/solutions`、`/about`、`/contact`（`lib/news-product-links.ts` + `components/NewsProductLinks.tsx`）。
- 锚文本基本为关键词承载型（产品名/栏目名），无裸链接；详情页有 `Back to {Category}`、`Related Products`、上一篇/下一篇。
- **薄弱点**：`/news?category=slug` 唯一入口只剩新闻详情页的分类徽章（列表页筛选按钮已按业务要求移除集），页脚/导航均无；`/search` 仅 InstantSearch 入口。

---

## 三、技术 SEO

**canonical 策略**
- 全站默认 = `SITE_URL`（首页自引用）；页面级经 `superMeta({ url })` 覆盖。
- 列表页：保留 `category`、`page=1` 去参数、重复参数取第一个值；**越界页码回落第 1 页并 noindex**。
- 产品详情以**真实主分类**生成路径；新闻详情 `/news/{slug}`。
- 产品详情"服务故障态"**本轮显式声明 canonical**（此前会继承首页 canonical）。

**noindex 触发清单**：① 搜索页恒定；② 列表 API 失败；③ 列表越界页；④ 产品详情服务故障态（follow:false）；
⑤ 预览页；⑥ `notFound()`（Next 注入）。

**hreflang**：无（单语言站，无实际损失）。**`manifest`/apple-touch-icon**：缺失（对 SEO 影响很小）。

**结构化数据**：Organization（`@id=#manufacturer`）+ WebSite(SearchAction) 全站；Product（无 Offer，符合询盘制无价格）；Article；
FAQPage；BreadcrumbList（各页内联，首页无）。本轮删除了全仓无调用者的 `breadcrumbSchema()` 死代码。

**性能 / CWV 相关**：ISR 60s（首页、列表、详情）/ 3600s（静态页），搜索与预览 `force-dynamic`；
详情页 `generateStaticParams` 预渲染；`htmlLimitedBots: /.*/` 保证**不执行 JS 的抓取方（含 AI）在首屏 HTML 即拿到完整 metadata**；
图片 AVIF+WebP、显式 `sizes`、首图 `preload`；字体内联（Geist）；站内链接大面积 `prefetch={false}`。

**GEO / AI 检索**：`/llms.txt` 站点导览；`robots.txt` 对所有 UA（含 GPTBot/ClaudeBot/PerplexityBot）无差别放行；
结构化数据覆盖面较广；正文服务端渲染纯 HTML（经 `cleanPostContent` 清洗）。

---

## 四、本轮修掉的 SEO 缺口

| 缺口 | 处置 | 文件 |
|---|---|---|
| `/news/[slug]` 摘要为空时整条 meta description 丢失（`meta-description` 审计失败） | 摘要为空时回退「标题 + 站点定位」，并 `slice(0,160)` | `app/news/[slug]/page.tsx` |
| `/solutions/faq` 整页无 H1 | 补页面级 H1 `Camera OEM & ODM FAQ` | `app/solutions/faq/page.tsx` |
| `/about` H1 为 `Our Story`，与 title 主题词脱节；`ABOUT.hero.title` 已定义未使用 | H1 改用 `ABOUT.hero.title`（`About Songdian Technology`） | `app/about/page.tsx` |
| `/contact` 与 layout 重复输出同 `@id` 的 Organization 块 | 移除页面级重复块与随之无用的 import | `app/contact/page.tsx` |
| 产品详情故障态 canonical 继承首页 | 显式声明产品自身 canonical（该态仍 noindex） | `app/products/[...slug]/page.tsx` |
| 规格 slug 漂移导致 key facts 不显示（影响产品页主题词覆盖） | 服务层统一连字符 + 官网兼容历史下划线 + 后台同步 | `backend/product/services.py`、`app/products/[...slug]/page.tsx`、`admin-next/.../product-form/page.tsx` |
| 证书图片 `alt` 混中文（图片搜索/读屏） | 统一英文 | `components/CertificateGallery.tsx` |
| 搜索页参数未归一化导致错误态/矛盾分页文案 | 走全站统一口径 `readListQuery()` | `app/search/page.tsx` |

SEO 契约校验（`npm run verify:seo`）：**通过**。

---

## 五、仍未处理的 SEO 项（建议，按性价比排序）

1. **主推 SEO 只覆盖 4 个 SKU**（`lib/priority-products.ts`）：其余产品 title 默认回落型号（如 `DC403`）、description 为拼接句，长尾偏薄。
   建议逐步为出货主力补 `seo_title` / `seo_description`（后台字段已支持）。
2. **`?category=` 聚合页未进 sitemap 且内链薄弱**：这些 URL 是自引用 canonical、可索引的。建议至少让新闻分类聚合页从页脚或
   新闻详情页获得更多入链（或恢复一个轻量分类入口）。
3. **新闻 sitemap 条目缺 `lastModified`**：需后端补"实际更新时间"字段，当前刻意省略（不拿创建时间冒充）。
4. **`Terms of Service` 页面缺失**（`reports/localhost-full-audit.html` 已列为待办），影响信任页完整性。
5. **无 `app/manifest.ts` 与 apple-touch-icon**：对 SEO 影响小，属 PWA/移动端完善项。
6. **`Organization.logo` 指向 `/logo.png`**：建议确认该文件为 1200px 级别位图（favicon 为 SVG），否则 Google 可能不采用该 logo。
7. **hreflang 未声明**：单语言站无损失；若将来做多语言需补 `alternates.languages`。
8. **`lib/seo.ts` 的 `localBusinessSchema()` 现无调用者**（contact 去重后）：保留备用或清理。
