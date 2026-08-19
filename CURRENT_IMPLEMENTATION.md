# 当前实现总览（2026-08-19）

本文档是仓库现状的单一参考入口。当前行为以代码、`docker-compose.yml`、Aerich 迁移和 GitHub Actions 为准；历史设计稿、审计报告与归档计划仅用于追溯。

## 系统边界

- 官网：`frontend/`，Next.js 16 App Router，负责公开页面、SEO、产品/新闻展示、询盘、草稿预览和 Web Vitals。
- API：`backend/`，FastAPI + Tortoise ORM + Aerich，负责内容、产品、新闻、询盘、认证、缓存、媒体、版本记录、定时发布和管理 API。
- 管理后台：`admin-next/`，独立 Next.js 16 应用，使用 Cookie-only 管理员认证，通过同源 `/api`、`/uploads` rewrite 访问后端。
- 数据服务：PostgreSQL 18.4、Redis 8.8.1 和 Docker 命名卷；运行时上传媒体保存在 `uploads_data`。
- 生产发布：GitHub Actions 构建带 commit SHA/tag 的 GHCR 不可变镜像，生产通过独立 `migrate` profile 执行迁移后切换应用。

## 环境地址边界

| 场景 | 浏览器公开 API | 官网服务端 API | 后台服务端代理 |
|---|---|---|---|
| 本地开发 | `http://127.0.0.1:8000` | `http://127.0.0.1:8000` | `http://127.0.0.1:8000` |
| Docker Compose | `https://api.zsaki.icu` | `http://backend:8000` | `http://backend:8000` |

- `frontend/.env.local` 只用于本地开发，已被 Git 与 Docker 构建上下文忽略。
- `NEXT_PUBLIC_API_URL` 是构建期公开地址；`INTERNAL_API_URL` 和 `BACKEND_PROXY_URL` 是容器运行/构建时的内部服务地址。
- 生产域名为 `www.zsaki.icu`、`api.zsaki.icu`、`admin.zsaki.icu`，根域重定向到 `www`。

## 内容工作流

- 产品与新闻支持 `DRAFT`、`SCHEDULED`、`PUBLISHED`；到期前的定时内容不会进入公开列表、详情、搜索或 sitemap。
- 后台调度器默认每 30 秒检查到期内容，发布后清理 Redis 内容缓存并调用官网 `/api/revalidate` 清理 ISR。
- 产品与新闻核心字段写入不可变 `ContentRevision` 快照；查看和恢复通过各资源的 `/admin/products|news/{id}/revisions` 路由提供，恢复本身会继续生成新版本。
- 后台可签发默认 15 分钟有效的预览令牌；官网 `/preview/[token]` 强制 `noindex`、`no-store`，不改变正式页面视觉与正式 URL。
- 最新迁移为 `12_20260819090000_add_content_revision_and_scheduling.py`；生产只执行 `aerich upgrade`，不删除或重建已有卷。

## 官网数据与错误处理

- 公开页面通过 FastAPI 获取产品、新闻、分类与设置；写入后由后端统一失效列表、详情、旧 slug、Redis 与 ISR 缓存。
- `ApiError` 保留 HTTP `status`、业务 `code`、请求 `path` 和原始 `cause`。
- 产品详情仅将 HTTP 404 或业务码 `A010001` 视为不存在并进入标准 `notFound()`；网络、429、500、502 和非法响应显示可重试的暂不可用状态，不再伪装为 `Product Not Found`。
- 产品详情使用 React `cache()` 去重；静态生成限制并发，避免批量预渲染时触发后端每 IP 限流。
- 产品卡片和详情图库保留 `object-contain`，已移除额外大内边距，保证产品主体不裁切且不远离边框。

## 管理后台媒体与认证

- 登录、刷新和退出只使用 HttpOnly Cookie；生产环境额外启用 `Secure`，浏览器 JavaScript 不读取或保存 JWT。
- 后台媒体使用 `resolveMediaUrl()`：相对 `/uploads/...` 保持同源，由 Next.js rewrite 转发到后端；外部绝对 URL 原样保留。
- 禁止在组件中重新拼接 `http://localhost:8000`，否则会破坏 Windows、Docker 和生产域名兼容性。
- 产品/新闻编辑页包含内容状态、发布时间、版本历史、恢复和短期预览入口。

## 现有业务与官网能力

- 询盘记录国家/地区、来源产品、落地页、来源页和 UTM 归因；产品 CTA 通过 `?product=<slug>` 预填来源产品。
- 后台通知覆盖新询盘、超过 24 小时未跟进和 SMTP 失败，并通过 `NotificationReadState` 记录用户级已读状态。
- 搜索使用 PostgreSQL TSVector；缺少 `zhparser` 时降级 `simple`，本地 SQLite 走 LIKE 降级。
- 官网 SEO 使用规范 URL、sitemap、robots、Open Graph 和 JSON-LD；组织类型为 `Manufacturer` 并使用统一 `@id`。
- 首页与 About 保留源码内工厂视频；联系页地图、Cookie 横幅和底部询盘栏在移动端协调显示，不产生横向溢出。

## 可靠性、质量与发布

- 生产要求真实 Redis（`REDIS_REQUIRED=true`）；`/readyz` 同时探测 PostgreSQL 和 Redis，任一关键依赖不可用即阻止发布。
- CI 运行后端 Ruff/pytest、前后台 lint/build、SEO 校验、真实 PostgreSQL/Redis 迁移测试、Playwright 关键链路、Lighthouse 阈值与依赖审计。
- Web Vitals 仅在用户同意 Analytics 且 GA4 已配置时上报 LCP、CLS、INP、FCP 与 TTFB，不增加身份信息采集。
- 生产发布先备份 PostgreSQL 与 `uploads_data`，再运行迁移、切换三个应用并冒烟；应用镜像可自动回滚，数据库迁移不会自动反向回滚。
- 生产数据和运行时上传媒体不进入 Git；静态工厂视频属于前端源码资产，随镜像发布。

## 发布前必须确认

1. 所有新增源码、迁移、测试、预览和内容工作流文件已纳入同一个 commit；不得只提交已跟踪文件。
2. `.env`、`.env.local`、Cookie、数据库、上传卷和运行日志不得进入发布 commit。
3. 产品或分类 slug 变化后运行 `npm run gen:map` 并提交规范 URL 映射。
4. CI 全部通过后，以该 commit SHA 运行 `Deploy production`；不要把服务器现场构建作为正式发布方式。

## 仍属于后续工作的事项

对象存储/CDN、多机横向扩容、数据库迁移自动回退、销售转化分析和更细粒度 RBAC 尚未实现；实施前需单独评估并更新本文档。
