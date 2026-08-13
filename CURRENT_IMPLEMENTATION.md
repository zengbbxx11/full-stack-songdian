# 当前实现总览（2026-08-13）

本文档是仓库现状的单一参考入口，内容以当前代码、Compose 配置、迁移文件和 GitHub Actions 为准。历史设计稿、审计记录和迁移规划文档保留用于追溯，不代表未完成的工作仍是当前运行方式。

## 系统边界

- 官网：`frontend/`，Next.js App Router，负责公开页面、SEO 元数据、结构化数据、产品展示和询盘表单。
- API：`backend/`，FastAPI + Tortoise ORM + Aerich，负责内容、产品、新闻、询盘、认证、缓存、鉴权和管理 API。
- 管理后台：`admin-next/`，独立 Next.js 应用，使用 Cookie-only 管理员认证和后台 API。
- 数据服务：PostgreSQL 18 生产线、Redis 8.8.1、Docker Compose；对象媒体仍使用本地卷。
- 生产发布：GitHub Actions 构建带 commit SHA/tag 的 GHCR 镜像，生产服务器拉取指定版本；数据库迁移通过独立 `migrate` profile 执行。

## 当前已实现的可靠性能力

- 产品、新闻和分类的列表/详情缓存会在写入后统一失效；修改 slug 时同时清理旧 slug 缓存。
- 生产环境默认要求真实 Redis（`REDIS_REQUIRED=true`）；本地开发在 Redis 不可用时允许进程内内存降级。`/readyz` 会区分 Redis 正常与降级状态。
- 询盘支持国家、产品来源、落地页、来源页面和 UTM 归因字段；官网通过 `AttributionTracker` 保存首次归因，产品详情 CTA 会带入产品 slug。
- 后台通知支持新询盘、超过 24 小时未跟进和 SMTP 失败，并按用户记录已读状态；前端通知下拉框每 30 秒轮询。
- 官网联系页地图不产生移动端横向溢出；Cookie 横幅与全宽 Quick Inquiry 底栏会协调显示，联系页不重复显示浮层。

## 当前官网设计与 SEO

- 设计系统使用统一圆角层级（6/10/12/16/20/24/28px），用于卡片、筛选栏、图片、详情面板和浮层；页脚为浅灰/白色，保留黑红品牌 Logo。
- 产品内页 Hero 已压缩，面包屑使用胶囊式层级导航；产品筛选栏提供 H1、当前筛选状态、结果数和清晰的分类入口。
- 首页和 About 页面均保留工厂视频 `frontend/public/Video/SongdianFactoryVideo.mp4`；视频使用原生延迟加载/预加载策略，避免阻塞首屏。
- 页面标题、描述和 JSON-LD 明确 Songdian Technology 为 digital camera manufacturer / OEM/ODM camera factory；组织结构化数据使用 `Manufacturer` 和统一 `@id`。

## 当前发布与验证方式

1. GitHub Actions 运行后端、官网和后台 lint/build，并执行真实 PostgreSQL/Redis 迁移测试。
2. 主分支或版本 tag 构建 GHCR 镜像；生产部署工作流只接受完整 SHA 或 tag，不在服务器现场构建。
3. 服务器先备份，再执行一次性 Aerich 迁移，启动指定镜像，检查 `/healthz`、`/readyz` 和核心页面/询盘冒烟流程。
4. 失败时按部署脚本记录的上一版本镜像回滚。

## 数据与 Git 边界

`db/` 中的生产数据快照和运行时上传媒体不作为生产部署输入，也不应长期跟随 Git。代码仓库维护迁移、种子/示例结构和文档；生产数据与上传媒体由服务器本地卷保存并按部署指南单独备份。例外是官网展示所需的静态工厂视频 `frontend/public/Video/SongdianFactoryVideo.mp4`，它是当前前端源码资产，会随前端镜像发布。

## 仍属于后续工作的事项

对象存储/CDN、多机横向扩容、完整版本恢复/定时发布、销售转化分析和更细粒度 RBAC 仍未纳入本轮现状描述；实施前需单独评估并更新本文档。
