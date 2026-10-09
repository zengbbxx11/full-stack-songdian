# SEO 维护与部署（2026-09-29）

本次保留官网布局、样式、动画、正文和现有 URL。页面 SEO 经统一入口生成，后台维护内容无需修改前端代码。

## 自动生成与人工覆盖

- 产品：复用已有 seo_title / seo_description。两个字段独立遵循人工值 > 真实产品数据 > 站点默认值。只有型号式名称才追加真实分类；光学变焦仅从明确的 Optical Zoom / Zoom 真实属性读取，不把数字变焦当光学变焦。不使用型号硬编码表。
- 新闻：新增可空 seo_title（120 字符）和 seo_description（300 字符）。后台新闻表单支持填写、修改、清空；留空使用标题、摘要或清洗后的正文。版本记录保存 SEO，旧版本缺少字段时恢复自动模式。
- 分类：保留 /products?category=slug，复用当前分类介绍；新分类按真实名称自动兜底。无需生成新的路由或大量分类正文。
- SEO 覆盖不改变可见产品名称、新闻标题或正文。重要产品的可见 H1 如仅有型号，应由编辑确认真实名称后在后台调整，本次不批量重写。

## 发布依赖

1. 按现有发布流程备份数据库，使用包含本次迁移的镜像显式运行 docker compose --profile tools run --rm migrate。新增迁移为 backend/migrations/models/18_20260929090000_add_news_seo.py，只增加新闻两个可空字段；既有数据无需回填。
2. 迁移成功后同步发布 backend、admin-next、frontend。不能只发布后台表单或只发布新后端。应用启动不自动迁移。本次未执行生产迁移或部署。
3. NEXT_PUBLIC_SITE_URL 使用正式 HTTPS 站点 origin，不带路径。沿用现有变量，不散落域名。更换域名后重建镜像。
4. 新增 SEO_INDEXABLE，默认 false。正式站须在前端构建和运行环境均设置 true；测试、预览、开发维持 false。Compose 已传入构建参数和运行变量；GitHub Actions 镜像构建需设置仓库变量 SEO_INDEXABLE=true（仅面向正式站的构建）。CI 测试 job 的 true 只为 SEO 验证，不会自动替正式站开启索引。
5. 改变索引开关后重新构建并重启前端，以刷新静态 Metadata。运行期响应头还能保护旧的静态页面，但不能代替构建配置一致性。管理后台始终 noindex，不受正式官网开关影响。

## Sitemap、Canonical、Schema

启用索引后，sitemap 使用公开已发布产品、新闻及有已发布产品的分类自动生成，沿用发布/撤回后的缓存失效机制。后台、搜索、预览、草稿和无意义筛选 URL 不入图；禁用索引时 sitemap 为空，robots.txt Disallow: / 且不声明 sitemap。

保留有意义的分类、分页 canonical；无效参数和越界分页沿用当前规整/noindex 规则。产品旧地址与错误分类仍由现有 308 重定向兼容。HTTP 到 HTTPS、www 与主域的入口重定向应在正式部署代理按实际域名核验，本次不猜测部署域名。

Organization、Product、Article、BreadcrumbList 复用现有组件并统一绝对 URL。Article 使用真实更新时间。没有增加价格、库存、评分、评价、认证或虚构 FAQ。新闻 sitemap slug 接口未提供更新时间，因此不伪造 lastModified。

## 日常维护

管理员继续设置真实名称、摘要、规格、图片和 slug，再发布内容。新产品和新闻自动得到 metadata、canonical、OG/Twitter、结构化数据、既有 Breadcrumb 和 sitemap，无需改 SEO 代码。核心内容可人工填写两个 SEO 字段；清空回到自动模式。编辑应为正文图片填写有意义的 alt 并使用正确尺寸，避免把关键词堆进图片描述。

上线后用真实域名检查 robots.txt、sitemap.xml、响应头与页面源 HTML，再提交 Search Console sitemap。实际收录、外部链接、搜索表现和真实用户 Core Web Vitals 需要上线后的观测，本地自动化不能证明。

## 2026-10-09 索引与部署专项补充

正式 frontend 镜像 CI 现要求显式 Repository Variable SEO_INDEXABLE=true，缺失不再默认构建禁止索引的正式镜像。本地默认保持 false。Sitemap 严格分页、404 metadata 与公开部署冒烟的改动、生产核对命令及 GSC 复核步骤见 [索引排查与上线操作](./gsc-indexing-deployment.md)。本轮无新数据库迁移，未执行生产部署。
