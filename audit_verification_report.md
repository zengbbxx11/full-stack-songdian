# Songdian B2B 审计清单对比核实报告

> 对比基准：`C:\Users\Administrator\Desktop\Front-end project\full-stack-project`（规范仓库）
> 核实日期：2026-07-30
> 状态：**仅核实，未改动代码**

---

# 一、官网前端（Next.js）逐项核实

## 1. SEO 体系

### 1.1 页面 Title 动态管理
| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| SEO Title | ✅ **已实现** | `app/layout.tsx` 导出全局 `metadata`（含 `title.template: "%s \| 松典"`），所有子页面均导出 `generateMetadata()` 或 `superMeta()`，动态拼接标题 |
| Meta Description | ✅ **已实现** | 全局 `description` + 每个子页面独立 description |
| Keywords | ✅ **已实现** | `app/layout.tsx` 全局 metadata.keywords（14 个关键词数组） |
| Canonical URL | ✅ **已实现** | 全局 `alternates.canonical: SITE_URL`，产品/新闻详情页独立 canonical |
| Open Graph | ✅ **已实现** | 全局 `og:type=website, og:locale=en_US, og:image`，产品详情页覆盖 og:image 为首张产品图 |
| Twitter Card | ✅ **已实现** | `summary_large_image` 卡片类型，含图片 |
| Schema 结构化数据 | ✅ **已实现** | `lib/seo.ts`（274行）实现 7 种 JSON-LD Schema：Organization、WebSite(含SearchAction)、BreadcrumbList、Article、Product、FAQPage、LocalBusiness |
| Sitemap 自动生成 | ✅ **已实现** | `app/sitemap.ts` 用 Next.js 原生 `MetadataRoute.Sitemap`，包含静态路由 + 动态产品/文章路由 |
| Robots 管理 | ✅ **已实现** | `app/robots.ts` 配置 `allow:/` + 指向 sitemap.xml |
| Google Search Console | ✅ **已实现** | `app/layout.tsx` 第 164 行 `verification.google` 环境变量注入 |

**结论：SEO 体系已完整实现，远远超出基础要求。Product Schema 已含 Brand/Manufacturer/Model/Image/Description。评分：优秀。**

> ⚠️ 然而，这些 SEO 元数据**来源受限于后端**：产品 title/description 取自 `product.title` / `product.content_html`（截取），而非专门的 SEO 字段。这是后端需要补齐的地方（见第三部分）。

---

## 2. 多语言架构

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `[lang]` URL 结构（如 `/en/products/`） | ❌ **缺失** | 全部路由为单语言结构，无 `[lang]` 动态参数 |
| i18n 库（next-intl / next-i18next） | ❌ **缺失** | `package.json` 无任何 i18n 依赖 |
| 翻译文件目录（locales/ / messages/） | ❌ **缺失** | 无翻译文件目录 |
| HTML lang 属性 | ⚠️ **硬编码 `en`** | `app/layout.tsx` 第 200 行 `<html lang="en">` |
| Open Graph locale | ⚠️ **硬编码 `en_US`** | `app/layout.tsx` 第 123 行 |

**结论：多语言完全缺失。全站硬编码英文。若后期加语言需重构路由结构。评分：需从零建设。**

---

## 3. 产品详情页营销能力

### 3.1 当前页面板块（`app/products/[slug]/page.tsx`）

| 板块 | 状态 | 说明 |
|------|------|------|
| 产品卖点/特性要点 | ✅ 有 | 从 `short_description` HTML 中提取 bullet points |
| 核心参数/Specifications | ✅ 有 | 表格形式展示技术规格 |
| 应用场景 | ❌ **缺失** | 无 Use Cases / Applications 板块 |
| 功能介绍/Product Highlights | ✅ 有 | `content_html` 完整 HTML 渲染 |
| 视频 | ❌ **缺失** | 无视频播放器 |
| 下载资料 | ❌ **缺失** | 无 PDF/文档下载 |
| FAQ | ❌ **缺失** | FAQ 在独立 `/solutions/faq` 页面，产品页未嵌入 |
| 客户案例 | ❌ **缺失** | 无客户评价/案例引用 |
| 询盘 CTA | ✅ 有 | "Send Inquiry" + "Back to Category" 双按钮 |
| OEM/ODM 说明 | ✅ 有 | 蓝色横幅 "Available for OEM/ODM" |
| 相关产品推荐 | ✅ 有 | 基于同分类的 4 个产品 |
| 产品图集/图片画廊 | ✅ 有 | `ProductGallery` 客户端组件，主图+缩略图 |

**结论：产品详情页有基础展示能力，但营销转化板块（场景/视频/下载/FAQ/案例）严重缺失。评分：需大幅补强。**

---

## 4. 图片性能优化

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| WebP/AVIF 支持 | ✅ **已实现** | `next.config.ts` `images.formats: ["image/avif", "image/webp"]` |
| 图片压缩 | ⚠️ **依赖 Next.js 内置** | 无独立压缩工具，依赖 `next/image` 自动优化 |
| CDN | ⚠️ **未独立配置** | 无 CDN 专项代码，静态资源由 OpenResty 反代 |
| 多尺寸图片 | ✅ **已实现** | `deviceSizes: [480,640,768,1024,1280,1536]` + `imageSizes: [16,...,768]` |
| next/image 使用 | ✅ **广泛使用** | `SafeImage` 封装 + `ProductGallery` + 新闻详情等 |
| 外部图片缓存 | ✅ **已配置** | `minimumCacheTTL: 3600` (1小时) |

**结论：图片优化基础扎实。主要短板是缺少真正的 CDN 分发（当前依赖单服务器 OpenResty）。评分：P1 级别补强。**

---

## 5. 数据分析能力

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Google Analytics 4 | ✅ **已实现** | `CookieConsent.tsx` 第 112-126 行，consent-gated GTAG 注入。需配置 `NEXT_PUBLIC_GA_ID` |
| Google Search Console | ✅ **已实现** | `app/layout.tsx` verification 集成 |
| Microsoft Clarity | ❌ **缺失** | 无 Clarity 代码 |
| 事件追踪（查看产品/点击询盘/下载/WhatsApp） | ❌ **缺失** | GA4 仅基础 pageview，无自定义事件 |
| Google Tag Manager | ❌ **缺失** | 无 GTM 集成 |

**结论：有 GA4 基础接入（consent-gated），但缺少事件追踪和 Clarity。评分：P1 补强。**

---

# 二、管理后台（admin-next）逐项核实

## 1. 后台整体定位

| 清单要求 | 核实结果 |
|----------|----------|
| 更像 CMS 还是运营中心？ | **当前更接近 CMS**。侧边栏：仪表盘/产品/分类/新闻/询盘/媒体库/设置/账号 |
| 缺 SEO 管理？ | ❌ **完全缺失**，无任何 SEO 相关页面 |
| 缺询盘 CRM？ | ❌ **极度简化**，仅 3 状态（NEW/REPLIED/ARCHIVED），无分配/标签/跟进流水 |
| 缺数据分析？ | ⚠️ Dashboard 仅有 4 个统计卡片 + 饼图 + 进度条，无分析深度 |

**结论：清单评价准确——当前是 CMS 而非运营中心。**

---

## 2. 产品管理功能

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 产品复制/克隆 | ✅ **已实现** | `products/page.tsx` 第 262 行「复制」链接 → `product-form?copy_from={id}`，预填数据，标题加 "Copy of" 前缀 |
| 图片复制 | ❌ **未实现** | 复制时不复制图片关联 |
| 参数复制 | ⚠️ **间接实现** | 复制时 `content_html` 和属性一起预填 |
| SEO 复制 | ❌ **未实现** | 产品无 SEO 字段，无从复制 |
| 批量发布/隐藏 | ❌ **缺失** | 无复选框/批量操作 UI |
| 批量修改分类 | ❌ **缺失** | 无批量分类操作 |
| 批量删除 | ❌ **缺失** | 仅单个删除（弹窗确认） |
| 批量导出 | ❌ **缺失** | 无导出功能 |
| 搜索筛选 | ✅ **已实现** | 关键词搜索 + 分类下拉筛选 + 清除筛选 |

**结论：产品复制已实现，但批量操作全线缺失。**

---

## 3. SEO 后台

| 功能 | 核实结果 |
|------|----------|
| 页面标题管理 | ❌ **缺失**，无 SEO 管理页面 |
| 描述/关键词管理 | ❌ **缺失** |
| URL / 301 跳转管理 | ❌ **缺失** |
| Sitemap 管理 | ❌ **缺失**（前端 sitemap.ts 自动生成，但不支持后台手动控制） |

**结论：SEO 后台完全缺失。**

---

## 4. 询盘管理（CRM）

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 状态流转 | ⚠️ **极简** | 仅 3 状态：`NEW → REPLIED / ARCHIVED → ARCHIVED`。后端状态机在 `inquiry/services.py` 第 101 行 |
| 跟进备注 | ⚠️ **部分实现** | `reply_note` 字段（单个回复备注），非多次跟进流水 |
| 分配销售人员 | ❌ **缺失** | 后端模型无 `assigned_user` 字段 |
| 客户标签 | ❌ **缺失** | 无标签系统 |
| 来源分析 | ⚠️ **部分实现** | 有 `source_page` 字段记录来源 URL，但后台无来源统计视图 |

**结论：询盘管理缺乏 CRM 能力，缺少状态流（联系中→报价→样品→成交→失败）、分配、标签。**

---

## 5. 操作审计界面

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 操作日志列表页 | ❌ **缺失** | 无 `/audit` 或 `/logs` 路由 |
| 用户/时间/操作/修改内容展示 | ❌ **缺失** | 后端有 30 处 @audit + AuditLog 表 + 查询 API，但**前端未对接** |

**结论：后端审计体系完善但前台界面缺失。**

---

## 6. Dashboard

| 功能 | 核实结果 |
|------|----------|
| 统计卡片 | ✅ 4 个（产品/新闻/分类/询盘总数） |
| 图表 | ⚠️ 仅有产品分类分布饼图 + 进度条 |
| 最近询盘 | ✅ 最新 5 条 |
| 国家分布地图 | ❌ **存在代码但未集成**（`CountryMap.tsx` 闲置） |
| 询盘趋势图 | ❌ **缺失** |

---

# 三、后端系统逐项核实

## 1. 询盘系统 → CRM 升级

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `status` 字段 | ✅ **已存在** | `inquiry/models.py` 第 21 行，`NEW/REPLIED/ARCHIVED` |
| `source` 字段 | ✅ **已存在** | `source_page` 字段记录来源 URL |
| `assigned_user` 字段 | ❌ **缺失** | 无分配字段 |
| `follow_notes` 字段 | ❌ **缺失** | 仅有 `reply_note`（单个回复），非跟进记录 |
| `last_contact_time` 字段 | ❌ **缺失** | 无 |
| 更丰富的状态流转 | ❌ **缺失** | 状态机仅 3 状态，无「联系中→报价→样品→成交→失败」 |

**结论：清单评价准确——询盘系统停留于留言管理，需升级为 CRM。**

---

## 2. 产品 SEO 字段

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `seo_title` | ❌ **缺失** | Product 模型无此字段（`product/models.py` 第 27-51 行） |
| `seo_description` | ❌ **缺失** | 无 |
| `seo_keywords` | ❌ **缺失** | 无 |
| `canonical_url` | ❌ **缺失** | 无 |

**结论：Product 模型完全缺失 SEO 专属字段。目前前端 SEO 元数据从 `title` / `content_html` 截取，缺乏运营自主优化能力。**

---

## 3. 产品型号体系

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `model_number` | ❌ **缺失** | 仅有 `sku` 字段（`varchar(100)`），无独立型号字段 |

**结论：当前 SKU 可承载型号信息（如 DC312），但语义不明确。建议新增独立 `model_number` 字段。**

---

## 4. 文件上传安全

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| MIME 类型检测 | ❌ **缺失** | 仅校验扩展名白名单 `{".jpg",".jpeg",".png",".webp",".gif"}`，不校验实际 MIME（`uploads/services.py` 第 30 行） |
| 文件随机命名 | ✅ **已实现** | `uuid.uuid4().hex` + 扩展名（第 64 行） |
| 病毒扫描 | ❌ **缺失** | 无 ClamAV 或其他扫描 |
| 上传审计 | ⚠️ **部分实现** | `UploadRecord` 表记录 URL/文件名/大小/上传者，但非正式审计日志 |
| 文件大小限制 | ✅ **已实现** | 单文件 ≤ 10MB，批量 ≤ 100MB |
| 路径穿越防护 | ✅ **已实现** | UUID 命名 + 年份子目录 |

**结论：基础防护有（扩展名+UUID+大小限制），但缺少 MIME 校验和病毒扫描两大关键安全措施。攻击者可伪装扩展名绕过白名单。**

---

## 5. 缓存策略

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Redis 存在 | ✅ **存在** | `common/redis_client.py`，支持优雅降级到 MemoryBackend |
| 首页数据缓存 | ❌ **未缓存** | 首页产品列表直接查库 |
| 热门产品缓存 | ❌ **未缓存** | 无 |
| 分类列表缓存 | ❌ **未缓存** | 无 |
| 搜索结果缓存 | ✅ **已缓存** | TTL=60s |
| 产品详情缓存 | ✅ **已缓存** | TTL=300s |
| 缓存失效策略 | ✅ **已实现** | Cache-Aside：写操作删除缓存，下次读时重建 |

**结论：缓存策略偏基础，仅覆盖产品详情和搜索。首页、列表等高频读数据未缓存。**

---

## 6. 搜索能力

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| PostgreSQL 全文检索 | ✅ **已实现** | `tsvector` + `plainto_tsquery` + `ts_rank`，有 GIN 索引，zhparser 降级为 `simple` |
| Meilisearch / Elasticsearch | ❌ **未集成** | 无 |
| 搜索型号 | ❌ **不支持** | tsvector 仅索引 title/summary/content_html，sku 不在检索范围内 |
| 搜索参数/属性 | ❌ **不支持** | `ProductAttribute` 不在搜索向量中 |
| 搜索文章（新闻） | ✅ **支持** | 新闻 title/summary/content_html 在搜索范围内 |

**结论：PG 全文检索方案完整，但搜索字段覆盖不足（缺 sku/属性/分类名）。产品量不大时可暂用，量上来后建议补 sku 进 tsvector。**

---

## 7. 操作审计（后端）

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| @audit 装饰器 | ✅ **已实现** | 覆盖 30 处关键写操作（CRUD），6 个模块 |
| AuditLog 模型 | ✅ **已实现** | `content/models.py` 第 55-66 行，记录 user_id/username/action/resource/result/ip/created_time |
| 审计查询 API | ✅ **已实现** | `GET /api/v1/admin/audit-logs`（需 `audit:read` 权限） |
| 迁移文件 | ✅ **完整** | 8 个迁移（0-7），aerich.ini 正确 |

**结论：操作审计是后端最完善的模块之一。30 处装饰器 + 完整模型 + 查询 API。唯缺前端界面。**

---

# 四、上线部署逐项核实

## 1. 生产部署方案

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Docker 编排 | ✅ **已实现** | `docker-compose.yml`，5 服务（postgres/redis/backend/frontend/admin-next），3 命名卷 |
| Nginx / OpenResty | ⚠️ **配置未版本化** | 配置仅在 1Panel OpenResty 中，`deploy-guide.md` 第七章有内联配置片段，缺独立 .conf 文件 |
| SSL | ✅ **已实现** | 1Panel + Let's Encrypt |
| 环境变量 | ✅ **完整** | `.env.example` 覆盖所有关键变量 |
| 数据备份 | ⚠️ **仅手动命令** | 无自动备份脚本 |
| 生产部署文档 | ✅ **已实现** | `deploy-guide.md`（247 行，10 章，评分 9/10） |

**结论：部署方案整体完整。文档质量高，但 nginx 配置未纳入仓库版本管理，备份缺自动化。**

---

## 2. 单服务器风险

| 清单要求 | 核实结果 |
|----------|----------|
| 当前是否全在一台机器？ | ✅ **是。** Web + API + 数据库 + Redis 全部在同一 docker-compose 中 |
| 自动备份 | ❌ **缺失**（见下文） |
| 快照 | ❌ **未配置** |
| 拆分方案 | ❌ **未实施** |

**结论：清单评价准确——存在单点故障风险，需要备份+监控兜底。**

---

## 3. 自动备份机制

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| PostgreSQL 自动备份 | ❌ **缺失** | 仅有 `deploy-guide.md` 中的手动命令 + cron 建议，未确认已部署 |
| /uploads 备份 | ❌ **缺失** | `uploads_data` 卷无备份方案 |
| 保留策略（7天/30天） | ❌ **缺失** | 无 |
| 异地备份 | ❌ **缺失** | 无 |

**结论：备份体系为零——仅有手动命令。这是最高的 P0 风险项。**

---

## 4. 监控报警

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| 健康检查端点 | ✅ **已实现** | `GET /healthz`（存活）+ `GET /readyz`（就绪，含 DB/Redis 探测） |
| CPU / Memory / Disk 监控 | ❌ **缺失** | 无 Prometheus / Grafana 等 |
| API Error 监控 | ❌ **缺失** | 无 |
| Response Time 监控 | ❌ **缺失** | 无 |
| 告警（邮件/企业微信） | ❌ **缺失** | 无 |

**结论：仅有探针端点，无任何监控和告警体系。**

---

## 5. CI/CD

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Git Push → 自动测试 | ❌ **缺失** | 无 `.github/workflows/` 目录 |
| Docker Build 自动化 | ❌ **缺失** | 手动 `docker compose build` |
| 自动部署 | ❌ **缺失** | 手动 `git pull` + 重建 |
| 健康检查 | ⚠️ **仅容器级** | Docker Compose 内 backend 有健康检查，frontend/admin 无 |
| 测试套件 | ✅ **存在** | `backend/tests/` 有 11 个测试文件，但只能手动运行 |

**结论：CI/CD 完全缺失。有测试但无自动化执行。**

---

# 综合评分总表

## 按清单类别

| 优先级 | 模块 | 优化内容 | 清单评估 | 核实结果 | 真实状态 |
|--------|------|----------|----------|----------|----------|
| **P0** | 前端 | SEO 体系 | 需确认 | ✅ **已完整实现**（7 种 Schema + sitemap + robots + 全局 metadata） | 超预期，无需大改 |
| **P0** | 前端 | 多语言 | 需建设 | ❌ **完全缺失** | 需从零建设 |
| **P0** | 前端 | 产品营销页 | 需建设 | ❌ **缺场景/视频/下载/FAQ/案例** | 需大幅补强 |
| **P0** | 后台 | SEO 管理 | 需建设 | ❌ **完全缺失** | 需新建 SEO 管理模块 |
| **P0** | 后台 | 询盘 CRM | 需升级 | ❌ **仅 3 状态，缺分配/标签/跟进流** | 需升级 Inquiry 模型 + 前端 |
| **P0** | 后台 | 产品复制 | 需实现 | ✅ **已实现**（带数据预填） | 超额完成 |
| **P0** | 后端 | 询盘升级 CRM | 需升级 | ❌ **缺 assigned_user/follow_notes/last_contact_time** | 需扩建模型 |
| **P0** | 后端 | SEO 字段 | 需增加 | ❌ **Product 模型无 seo_* 字段** | 需扩建模型 |
| **P0** | 后端 | 上传安全 | 需加强 | ⚠️ **缺 MIME 校验 + 病毒扫描** | P0 高危 |
| **P0** | 部署 | 自动备份 | 需建设 | ❌ **仅手动命令** | P0 高危 |
| **P0** | 部署 | 生产规范 | 需确认 | ✅ **deploy-guide.md 完整** | 文档优秀 |
| **P1** | 前端 | 数据分析（事件追踪） | 需增加 | ⚠️ **仅有 GA4 pageview，缺事件** | 需补自定义事件 |
| **P1** | 前端 | 图片 CDN | 需优化 | ⚠️ **依赖 Next.js 内置，无 CDN** | 需 CDN 专项 |
| **P1** | 后台 | 批量操作 | 需实现 | ❌ **完全缺失** | 需新建 |
| **P1** | 后台 | Dashboard 增强 | 需增强 | ⚠️ **仅 4 卡片 + 饼图** | 可接受 |
| **P1** | 后端 | 产品型号字段 | 需增加 | ❌ **缺 model_number** | 可用 sku 暂代 |
| **P1** | 部署 | 监控告警 | 需建设 | ❌ **仅 /healthz，无监控体系** | 需建设 |
| **P1** | 部署 | 单服务器冗余 | 需优化 | ⚠️ **已在 docker-compose 中，备份兜底即可** | 短期可接受 |
| **P2** | 后端 | 搜索引擎 | 需升级 | ⚠️ **PG tsvector 完整，缺 Meilisearch/ES** | 当前量级可接受 |
| **P2** | 后端 | 缓存优化 | 需规划 | ⚠️ **仅覆盖详情/搜索，首页/列表未缓存** | 待补 |
| **P2** | 部署 | CI/CD | 需建设 | ❌ **完全缺失** | 待建 |
| **P2** | 后台 | 操作审计界面 | 需增加 | ❌ **后端有审计，前端无界面** | 待建 |

## 重大发现（与清单预期不同的亮点）

1. **SEO 体系远超预期**：清单标记为"需确认"，实际已完整实现 7 种 JSON-LD Schema + sitemap + robots + 全局 metadata + Google Search Console 验证。这是前端最大的亮点。

2. **产品复制已实现**：清单标记为需实现，实际上已通过 `copy_from` 参数实现了完整的克隆流程。

3. **部署文档质量高**：`deploy-guide.md` 覆盖从服务器初始化到运维全部 10 个章节。

## 重大发现（清单外的额外风险）

1. **后端 Product 模型无 SEO 字段**：前端 SEO 做得好，但数据来源受限（从 title/content_html 截取），运营无法独立优化每件产品的 SEO 元数据。

2. **上传 MIME 校验缺失**：攻击者可伪装扩展名绕过白名单——这是真实安全漏洞。

3. **完全无自动备份**：数据库和上传文件无任何自动化备份——这是上线最大的单一风险。

4. **前端/后台 Docker 健康检查缺失**：容器挂了 Docker 感知不到。

---

> **本文档为只读审计报告，未对代码做任何修改。如需执行某优化项，请逐条指派。**
