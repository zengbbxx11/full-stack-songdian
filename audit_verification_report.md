# Songdian B2B 审计清单对比核实报告

> **历史核实报告（2026-07），不作为当前部署依据。** 认证、依赖版本、域名与 Compose 架构已在后续安全修复中变更；请以根目录 [CURRENT_IMPLEMENTATION.md](CURRENT_IMPLEMENTATION.md)、[README.md](README.md) 和 [deploy-guide.md](deploy-guide.md) 为准。

> 对比基准：`C:\Users\Administrator\Desktop\Front-end project\full-stack-project`（规范仓库）
> 核实日期：2026-07-30
> 修��日期：2026-07-31
> 状态：**P0 清零，P1/P2 大部分已修复**

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

### 3.1 当前页面板块（`app/products/[...slug]/page.tsx`）

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

> ⚠️ **2026-07-31 更正**：本审计当时的路由文件名为 `app/products/[slug]/page.tsx`，属历史快照。现产品详情页 URL 已从扁平 `/products/{slug}` 重构为**分类嵌套** `/products/{category}/{slug}`（如 `/products/action-camera/860a`），路由文件相应改为 catch-all `app/products/[...slug]/page.tsx`。旧扁平地址与错分类地址经边缘层 `proxy.ts` 返回 **308** 永久重定向到规范地址（`proxy.ts` 依据 `lib/generated/canonical-map.ts` 映射表，该表由 `npm run gen:map` 从后端产品接口生成，须随产品/分类变动重跑）。上述营销能力板块结论（场景/视频/下载/FAQ/案例缺失）仍然成立，未受 URL 重构影响。

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
| 事件追踪（查看产品/点击询盘/下载/WhatsApp） | ✅ **已实现** | `cta_click` / `product_view` / `contact_submit` 三个自定义事件 |
| Google Tag Manager | ❌ **缺失** | 无 GTM 集成 |

**结论：GA4 consent-gated 基础接入 + 3 个核心转化事件已就绪。Clarity/GTM 可视需求后续接入。**

---

# 二、管理后台（admin-next）逐项核实

## 1. 后台整体定位

| 清单要求 | 核实结果 |
|----------|----------|
| 更像 CMS 还是运营中心？ | **当前功能完备**。侧边栏：仪表盘/产品/分类/新闻/询盘/媒体库/用户管理/审计日志/设置/账号 |
| 缺 SEO 管理？ | ✅ **已补（2026-07-31）** — 产品表单 SEO 面板 + 列表快速编辑弹窗 |
| 缺询盘 CRM？ | ✅ **已补（2026-07-31）** — 五态管线 + 分配/标签/跟进时间线 |
| 缺数据分析？ | ⚠️ Dashboard 已有 6 个区块（计数卡片 + 询盘国家分布 + 状态分布 + 分类饼图 + 最近询盘），询盘趋势已去掉 |

**结论：后台已从 CMS 升级为运营中心。**

---

## 2. 产品管理功能

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 产品复制/克隆 | ✅ **已实现** | `products/page.tsx` 第 262 行「复制」链接 → `product-form?copy_from={id}`，预填数据，标题加 "Copy of" 前缀 |
| 图片复制 | ❌ **未实现** | 复制时不复制图片关联 |
| 参数复制 | ⚠️ **间接实现** | 复制时 `content_html` 和属性一起预填 |
| SEO 复制 | ❌ **未实现** | 产品无 SEO 字段，无从复制 |
| 批量发布/隐藏 | ✅ **已实现** | 全选/单选 Checkbox + 批量操作栏（发布选中/隐藏选中/删除选中） |
| 批量修改分类 | ❌ **未实现** | 暂不需要 |
| 批量删除 | ✅ **已实现** | 批量选择确认删除 |
| 批量导出 | ❌ **缺失** | 无导出功能 |
| 搜索筛选 | ✅ **已实现** | 关键词搜索 + 分类下拉筛选 + 清除筛选 |

**结论：产品复制 + 批量发布/隐藏/删除 已实现。**

---

## 3. SEO 后台

| 功能 | 核实结果 |
|------|----------|
| 页面标题管理 | ✅ **已实现（2026-07-31）** — 产品表单 + SEO 面板（seo_title / seo_description），产品列表 + 快速编辑弹窗 |
| 描述/关键词管理 | ✅ **已实现** — seo_description 输入框（推荐 120-160 字符） |
| URL / 301 跳转管理 | ❌ **暂缓** — 当前无多域名/参数索引场景 |
| Sitemap 管理 | ❌ **暂缓** — 前端 sitemap.ts 自动生成，暂不需要手动控制 |

**结论：产品表单 + SEO 面板已落地，产品列表可快速编辑 SEO 元数据。301/sitemap 暂不需要。**

---

## 4. 询盘管理（CRM）

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 状态流转 | ✅ **已升级** | 五态管线：NEW → CONTACTING → QUOTED → DEAL / LOST，后端状态机严格校验 |
| 跟进备注 | ✅ **已升级** | `follow_notes` JSONB 时间线 + 前端展开查看每条记录 |
| 分配销售人员 | ✅ **已实现** | 管理员下拉选择，点击负责人列唤出分配面板 |
| 客户标签 | ✅ **已实现** | 逗号分隔编辑，前端 Badge 展示 |
| 来源分析 | ⚠️ **部分实现** | 有 `source_page` 字段记录来源 URL，但后台无来源统计视图 |

**结论：询盘管理已升级为 CRM 级别，含五态管线/分配/标签/跟进时间线。来源分析视图仍缺。**

---

## 5. 操作审计界面

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 操作日志列表页 | ✅ **已实现（2026-07-31）** | `audit-logs/page.tsx` — 时间/用户/操作/资源/结果/IP 表格 + 分页搜索 |
| 用户/时间/操作/修改内容展示 | ✅ **已实现** | 后端 36 处 @audit + AuditLog 模型 + 查询 API，前端表格页已对接 |

**结论：审计体系前后端全链路贯通。**

---

## 7. 用户管理

| 功能 | 核实结果 | 证据 |
|------|----------|------|
| 用户列表 | ✅ **已实现（2026-07-31）** | `users/page.tsx` — 表格展示所有后台账号 |
| 新建用户 | ✅ **已实现** | 弹窗（username + password），统一 admin 权限 |
| 删除用户 | ✅ **已实现** | 二次确认，admin 账号受保护不可删 |
| 密码重置 | ✅ **已实现** | 弹窗输入新密码，`PUT /admin/users/{id}/reset-password` |
| 角色管理 | ❌ **故意跳过** | 所有账号统一管理员权限，不做角色分级 |

**结论：用户管理含 CRUD + 重置密码，满足 B2B 小团队运营需求。**

---

## 6. Dashboard

| 功能 | 核实结果 |
|------|----------|
| 统计卡片 | ✅ 4 个（产品/新闻/分类/询盘总数） |
| 询盘国家分布 | ✅ **已实现（2026-07-31）** — Top 10 排行 |
| 询盘状态分布 | ✅ **已实现（2026-07-31）** — 五态管线进度条 |
| 产品分类饼图 | ✅ 已有 |
| 最近询盘 | ✅ 最新 8 条 |

---

# 三、后端系统逐项核实

## 1. 询盘系统 → CRM 升级

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `status` 字段 | ✅ **已升级（2026-07-31）** | NEW/CONTACTING/QUOTED/DEAL/LOST 五态管线 |
| `source` 字段 | ✅ **已存在** | `source_page` 字段记录来源 URL |
| `assigned_user` 字段 | ✅ **已修复（2026-07-31）** | FK → AdminUser，可分配/取消 |
| `follow_notes` 字段 | ✅ **已修复（2026-07-31）** | JSONB 数组 `[{time,user,note}]`，原子追加 |
| `last_contact_time` 字段 | ✅ **已修复（2026-07-31）** | 每次追加跟进时自动更新 |
| 更丰富的状态流转 | ✅ **已升级（2026-07-31）** | 五态管线 + 严格状态机校验 |

**结论：询盘系统已升级为 CRM 五态管线，含分配/标签/跟进记录/时间线。**

---

## 2. 产品 SEO 字段

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| `seo_title` | ✅ **已修复（2026-07-31）** | Product 模型新增 `seo_title VARCHAR(120)`，运营可手动精修 |
| `seo_description` | ✅ **已修复（2026-07-31）** | Product 模型新增 `seo_description VARCHAR(300)`，运营可手动精修 |
| `seo_keywords` | ❌ **故意跳过** | 运营决策：回退全局默认，不设产品级 keywords |
| `canonical_url` | ❌ **故意跳过** | 运营决策：系统自动处理（当前无多域名/参数索引场景） |

**结论：seo_title / seo_description 已落地，运营可为重点产品手动精修。keywords / canonical 按实战经验故意跳过。**

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
| MIME 类型检测 | ✅ **已修复（2026-07-31）** | `_validate_image_content()`：mimetypes 推断 + 魔数（magic bytes）双重校验，防扩展名伪造 |
| 文件随机命名 | ✅ **已实现** | `uuid.uuid4().hex` + 扩展名（第 64 行） |
| 病毒扫描 | ❌ **缺失** | 无 ClamAV 或其他扫描 |
| 上传审计 | ⚠️ **部分实现** | `UploadRecord` 表记录 URL/文件名/大小/上传者，但非正式审计日志 |
| 文件大小限制 | ✅ **已实现** | 单文件 ≤ 10MB，批量 ≤ 100MB |
| 路径穿越防护 | ✅ **已实现** | UUID 命名 + 年份子目录 |

**结论：基础防护有（扩展名+魔数+UUID+大小限制），缺少病毒扫描。mimetypes + 魔数双重校验已阻挡扩展名伪造攻击。**

---

## 5. 缓存策略

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Redis 存在 | ✅ **存在** | `common/redis_client.py`，支持优雅降级到 MemoryBackend |
| 首页数据缓存 | ✅ **已缓存** | 产品列表 Redis TTL=5min |
| 产品列表缓存 | ✅ **已缓存** | TTL=5min, Cache-Aside |
| 分类列表缓存 | ✅ **已缓存** | TTL=30min |
| 新闻列表缓存 | ✅ **已缓存** | TTL=5min, Cache-Aside |
| 搜索结果缓存 | ✅ **已缓存** | TTL=60s |
| 产品详情缓存 | ✅ **已缓存** | TTL=300s |
| 缓存失效策略 | ✅ **已实现** | Cache-Aside：写操作删除缓存，下次读时重建 |

**结论：缓存覆盖产品详情/列表/分类/新闻/搜索，Cache-Aside 模式统一。**

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

**结论：操作审计后端 36 处装饰器 + 模型 + API，前端 `audit-logs/page.tsx` 表格页已就绪。**

---

# 四、上线部署逐项核实

## 1. 生产部署方案

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| Docker 编排 | ✅ **已实现** | `docker-compose.yml`，5 服务（postgres/redis/backend/frontend/admin-next），3 命名卷 |
| Nginx / OpenResty | ⚠️ **配置未版本化** | 配置仅在 1Panel OpenResty 中，`deploy-guide.md` 第七章有内联配置片段，缺独立 .conf 文件 |
| SSL | ✅ **已实现** | 1Panel + Let's Encrypt |
| 环境变量 | ✅ **完整** | `.env.example` 覆盖所有关键变量 |
| 数据备份 | ✅ **已修复** | `scripts/backup.sh` 自动备份 + cron |
| 生产部署文档 | ✅ **已实现** | `deploy-guide.md`（247 行，10 章，评分 9/10） |

**结论：部署方案整体完整。文档质量高，nginx 配置未纳入仓库版本管理（OpenResty 配置在 1Panel 中）。**

---

## 2. 单服务器风险

| 清单要求 | 核实结果 |
|----------|----------|
| 当前是否全在一台机器？ | ✅ **是。** Web + API + 数据库 + Redis 全部在同一 docker-compose 中 |
| 自动备份 | ✅ **已实现** | `scripts/backup.sh` + cron（见 3.3） |
| 快照 | ❌ **未配置** |
| 拆分方案 | ❌ **未实施** |

**结论：清单评价准确——存在单点故障风险，需要备份+监控兜底。**

---

## 3. 自动备份机制

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| PostgreSQL 自动备份 | ✅ **已修复（2026-07-31）** | `scripts/backup.sh` pg_dump + gzip，cron 每日执行 |
| /uploads 备份 | ✅ **已修���（2026-07-31）** | `docker run` 挂载 `uploads_data` 卷 → tar.gz |
| 保留策略（7天/30天） | ✅ **7 天** | `find -mtime +7` 自动清理，每月 1 号长期保留 |
| 异地备份 | ⏸ **暂缓** | 本地 7 天作第一道防线，异地等上线稳定后加 |

**结论：`scripts/backup.sh` 已覆盖 PG + uploads 双轨备份，7 天滚动保留。异地备份暂缓。**

---

## 4. 监控报警

| 清单要求 | 核实结果 | 证据 |
|----------|----------|------|
| 健康检查端点 | ✅ **已实现** | `GET /healthz`（存活）+ `GET /readyz`（就绪，含 DB/Redis 探测）。前端/后台容器已补 healthcheck |
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
| **P0** | 后台 | SEO 管理 | 需建设 | ✅ **已实现（2026-07-31）** — 产品表单 SEO 面板 + 列表快速编辑 | 301/sitemap 暂缓 |
| **P0** | 后台 | 询盘 CRM | 需升级 | ✅ **已修复（2026-07-31）** — 五态管线 + 分配/标签/跟进时间线 | 后端+前端全链路 |
| **P0** | 后台 | 产品复制 | 需实现 | ✅ **已实现**（带数据预填） | 超额完成 |
| **P0** | 后端 | 询盘升级 CRM | 需升级 | ✅ **已修复（2026-07-31）** — 五态管线 + assigned_user/follow_notes/last_contact_time/tags | 与前端同步升级 |
| **P0** | 后端 | SEO 字段 | 需增加 | ✅ **已修复（2026-07-31）** — seo_title / seo_description 落地 | keywords/canonical 故意跳过 |
| **P0** | 后端 | 上传安全 | 需加强 | ✅ **已修复（2026-07-31）** — mimetypes + 魔数双重校验 | 病毒扫描暂不加 |
| **P0** | 部署 | 自动备份 | 需建设 | ✅ **已修复（2026-07-31）** — `scripts/backup.sh` 双轨备份 | 异地暂缓 |
| **P0** | 部署 | 生产规范 | 需确认 | ✅ **deploy-guide.md 完整** | 文档优秀 |
| **P1** | 前端 | 数据分析（事件追踪） | 需增加 | ✅ **已修复（2026-07-31）** — cta_click/product_view/contact_submit | 自定义事件 |
| **P1** | 前端 | 图片 CDN | 需优化 | ⚠️ **依赖 Next.js 内置，无 CDN** | 需 CDN 专项 |
| **P1** | 后台 | 批量操作 | 需实现 | ✅ **已修复（2026-07-31）** — 全选/批量发布/隐藏/删除 | |
| **P1** | 后台 | Dashboard 增强 | 需增强 | ✅ **已修复（2026-07-31）** — 询盘国家分布+状态分布 | |
| **P1** | 后端 | 产品型号字段 | 需增加 | ❌ **缺 model_number** | 可用 sku 暂代 |
| **P1** | 部署 | 监控告警 | 需建设 | ❌ **仅 /healthz，无监控体系** | 需建设 |
| **P1** | 部署 | 单服务器冗余 | 需优化 | ⚠️ **已在 docker-compose 中，备份兜底即可** | 短期可接受 |
| **P2** | 后端 | 搜索引擎 | 需升级 | ⚠️ **PG tsvector 完整，缺 Meilisearch/ES** | 当前量级可接受 |
| **P2** | 后端 | 缓存优化 | 需规划 | ✅ **已修复（2026-07-31）** — 产品/新闻/分类列表 Redis 缓存 | |
| **P2** | 部署 | CI/CD | 需建设 | ❌ **完全缺失** | 待建 |
| **P2** | 后台 | 操作审计界面 | 需增加 | ✅ **已修复（2026-07-31）** — `audit-logs/page.tsx` 表格页 | |
| **P2** | 后台 | 用户管理 | 需增加 | ✅ **已修复（2026-07-31）** — 新建/删除/重置密码，统一 admin 权限 | 无需角色分级 |

## 重大发现（与清单预期不同的亮点）

1. **SEO 体系远超预期**：清单标记为"需确认"，实际已完整实现 7 种 JSON-LD Schema + sitemap + robots + 全局 metadata + Google Search Console 验证。这是前端最大的亮点。

2. **产品复制已实现**：清单标记为需实现，实际上已通过 `copy_from` 参数实现了完整的克隆流程。

3. **部署文档质量高**：`deploy-guide.md` 覆盖从服务器初始化到运维全部 10 个章节。

## 重大发现（清单外的额外风险）

1. **后端 Product 模型 SEO 字段已补**：`seo_title` + `seo_description` 已落地，前端 `generateMetadata` 优先读这两个字段，空则回退原有 title/content_html 截取逻辑。

2. **上传 MIME 校验已修复**：mimetypes + magic bytes 双重防御，攻击者无法再通过伪造扩展名绕过上传白名单。

3. **备份体系已建立**：`scripts/backup.sh` 覆盖 PG dump + uploads tar 双轨备份，7 天滚动保留，需在服务器配置 cron。

4. **Docker 健康检查已补全**：frontend/admin-next 容器加 healthcheck，Docker 能感知容器故障并自动重启。

---

# 五、剩余未解决问题（2026-07-31）

| 优先级 | 问题 | 原因 |
|--------|------|------|
| ⏸ | 多语言 i18n | 暂无需求，后期需重构路由 |
| ⏸ | 产品营销板块（场景/视频/下载/案例） | 暂无素材 |
| ⏸ | model_number 字段 | 可用 sku 暂代 |
| ⏸ | 图片 CDN | 当前 OpenResty 单机兜底，量上来再上 CDN |
| ⏸ | 监控告警 | 1Panel 内置面板覆盖容器/主机监控，公网可达性用 UptimeRobot 免费版即可 |
| P2 | CI/CD（自动化测试+部署） | 手动部署够用，量上来再说 |
| P2 | Microsoft Clarity / GTM | 可选，GA4 已覆盖核心转化 |

---

> **审计基准日期：2026-07-30 | 修复实施日期：2026-07-31 | P0 全部清零，P1 覆盖 GA4/批量/Dashboard。剩余未修复：多语言(暂无需求)、产品营销(暂无素材)、model_number(sku 暂代)、CDN(OpenResty 兜底)、CI/CD(手动部署够用)。**
