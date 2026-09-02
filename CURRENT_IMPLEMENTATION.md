# 当前实现总览（2026-09-02）

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
- 最新迁移为 `15_20260826110000_add_content_sort_order.py`。15 号迁移补齐产品和新闻模型使用的 `sort_order` 字段；生产仍只执行 `aerich upgrade`，不删除或重建已有卷。

## 官网数据与错误处理

- 公开页面通过 FastAPI 获取产品、新闻、分类与设置；写入后由后端统一失效列表、详情、旧 slug、Redis 与 ISR 缓存。
- `ApiError` 保留 HTTP `status`、业务 `code`、请求 `path` 和原始 `cause`。
- 产品详情仅将 HTTP 404 或业务码 `A010001` 视为不存在并进入标准 `notFound()`；网络、429、500、502 和非法响应显示可重试的暂不可用状态，不再伪装为 `Product Not Found`。
- 产品详情使用 React `cache()` 去重；静态生成限制并发，避免批量预渲染时触发后端每 IP 限流。
- 产品卡片和详情图库保留 `object-contain`，已移除额外大内边距，保证产品主体不裁切且不远离边框。

## 管理后台媒体与认证

- 登录、刷新和退出只使用 HttpOnly Cookie；生产环境额外启用 `Secure`，浏览器 JavaScript 不读取或保存 JWT。
- 后台媒体使用 `resolveMediaUrl()`：相对 `/uploads/...` 保持同源，由 Next.js rewrite 转发到后端；外部绝对 URL 原样保留。
- 媒体库每条上传记录都可以通过 `GET /api/v1/admin/upload/{id}/usage` 查询引用明细，区分产品图库、产品封面和新闻封面，并从弹窗跳转到对应的产品/新闻编辑页；后端删除接口仍会阻止未确认的被引用素材删除。
- 产品与新闻编辑表单上传图片时，会按 `categorize=product:{slug}` / `categorize=news:{slug}` 自动归入媒体库的 `Products / {slug}` 或 `News / {slug}` 子相册；未填写 slug 的上传进入“未分类”。相册只改变逻辑归属，不改变媒体 URL，文件本身仍由后端存储后端管理。
- 媒体库提供“同步引用图片”和“自动归类”：前者为已有产品/新闻引用但缺少 `UploadRecord` 的 URL 补齐记录，后者仅按既有媒体 URL 路径规则整理未分类记录。
- 禁止在组件中重新拼接 `http://localhost:8000`，否则会破坏 Windows、Docker 和生产域名兼容性。
- 产品/新闻编辑页包含内容状态、发布时间、版本历史、恢复和短期预览入口。

## 系统设置与第三方统计配置

- 管理后台 `/settings` 通过同源代理调用 `/api/v1/admin/settings`。`ga_id`、`clarity_id`、联系邮箱、SMTP 主机等普通配置保存后明文回显；GA4 和 Clarity 只填写对应 ID，不填写完整安装脚本。
- 官网仍由现有的分析同意与运行时设置流程加载 GA4/Clarity；`ga_id` 或 `clarity_id` 留空即可关闭对应工具。本次后台回显修复没有新增统计脚本，也没有改变官网的同意逻辑。
- 设置页只提交相对当前服务端值发生变化的字段，并在保存成功后同步 SWR 缓存；服务端刷新不会覆盖用户正在编辑的字段，避免旧缓存或竞态读取把已保存值显示为空。
- 设置读取失败时显示可重试的错误状态；未确认到设置数据时禁止保存。保存成功但后续重新读取失败时，页面保留已保存值并提示重试。
- `smtp_password` 是唯一按敏感值处理的设置：后端返回 `******`，界面使用密码输入框并显示“已配置”；留空或不修改时保留原授权码，新授权码保存后也不会明文回显。
- 上述回显、局部提交和错误处理改动只涉及 `admin-next` 设置页，不涉及数据库结构、设置 API 协议或官网统计脚本。

## 现有业务与官网能力

- 询盘记录国家/地区、来源产品、落地页、来源页和 UTM 归因；产品 CTA 通过 `?product=<slug>` 预填来源产品。
- 后台通知覆盖新询盘、超过 24 小时未跟进和 SMTP 失败，并通过 `NotificationReadState` 记录用户级已读状态。
- 搜索使用 PostgreSQL TSVector；缺少 `zhparser` 时降级 `simple`，本地 SQLite 走 LIKE 降级。联合搜索在数据库分页前按“产品分组优先，新闻分组随后”排序，新闻组按 `created_time DESC, id DESC`；降级提示固定为英文 `Basic search mode`。
- 官网 SEO 使用规范 URL、sitemap、robots、Open Graph、Twitter Card 和 JSON-LD；组织类型为 `Manufacturer` 并使用统一 `@id`。默认社交图为 1200×630 的 `public/og/og-default.jpg`，产品与新闻详情有内容图时优先使用、无图时显式回退默认图。
- `/llms.txt` 作为实验性 AI 站点导览按小时再验证；它明确区分 2023 年成立的 Songdian Technology 法律实体与 2006 年开始的集团制造历史，不视为正式标准或排名保证。
- 当前工厂视频仅在 About 页面展示，使用 WebP poster、`preload="none"` 和可选 WebM source；视频、poster 与默认 OG 图均属于随 frontend 镜像发布的静态源码资产。
- 官网资源加载采用“首屏优先、非关键资源按需”的策略：Hero/Logo 等关键图片使用 `next/image` `preload`，`SafeImage` 默认使用 `loading="lazy"`，About 的时间轴/证书画廊使用 `next/dynamic` 分包，工厂视频使用 `preload="none"`。Contact 地图目前是 `ssr: false` 的客户端动态组件，并非滚动进入视口后才加载。
- 官网 Header 在 `lg` 断点显示桌面导航、搜索和报价 CTA，较窄视口使用移动菜单，避免平板端搜索框挤压导航；站内导航链接使用 `scroll={false}` 配合显式顶部重置，确保从任意滚动位置跳转到新页面都从首屏开始。About 页首屏顺序为 `Who We Are / Our Story`，`Our Journey` 位于下一段。
- 首页 Hero 在 `xl`（≥1280px）宽屏使用上左对齐，内容仍沿 `site-container` 左侧基线；标题内容列放宽至 980px，避免 1920px 视口不必要的换行。底部 CTA 与 Scroll 提示避开固定 56px 询盘栏；平板和手机保留自然流式布局，并在 1024px、390px 视口验证无横向溢出。
- 官网即时搜索聚焦时只显示一层品牌红边框，避免全局焦点环与输入框边框叠加；页脚四个社交图标统一占用 `44×44px` 槽位，链接状态不会改变图标间距。
- 联系页地图、Cookie 横幅和底部询盘栏在移动端协调显示，不产生横向溢出。产品分类与 FAQ 移动目录提供横滑提示、边缘控制和 sticky 定位；首图预加载、结构匹配骨架、触屏反馈和 `prefers-reduced-motion` 已统一。

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
4. 在 GitHub Actions Variables 配置生产 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_IMAGE_HOST`；根目录 `.env` 不会改写已经构建好的 GHCR 前端镜像。
5. GitHub Actions 的 `CI` 中 `backend`、`frontend`、`admin`、`compose`、`migration`、`e2e`，以及同一 commit 的 `images` 矩阵三项均成功后，才允许发布；`images` 被跳过时不能部署。
6. 从 GitHub commit 详情页复制 40 位完整 SHA；手动发布时在服务器执行 `git pull --ff-only origin master` 后，用 `git rev-parse HEAD` 与目标 SHA 核对一致，再执行 `scripts/deploy.sh`。
7. 发布后必须检查 Compose 服务状态、`/readyz`、官网、管理后台、`/llms.txt`、默认 OG 图和视频 Range 响应；完整命令以 [`deploy-guide.md`](./deploy-guide.md) 的手动部署章节为准。

## 仍属于后续工作的事项

对象存储/CDN、多机横向扩容、数据库迁移自动回退、销售转化分析和更细粒度 RBAC 尚未实现；实施前需单独评估并更新本文档。
