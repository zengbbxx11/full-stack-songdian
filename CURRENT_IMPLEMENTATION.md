# 当前实现总览（2026-09-11）

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
- 后台新闻 GET `/admin/news` 使用 news:read 权限并包含全部状态；新闻创建表单提交必填分类。产品与新闻保存/删除后刷新后台列表缓存，改草稿仍可编辑及签名预览。编辑页加载失败阻止保存，发布时间按设备本地时区显示并转换为带时区 ISO 提交。
- 产品复制仅预填基本信息、封面和 SEO，图库、规格保存后另行添加；图库和规格的增删立即保存。预览按钮支持弹窗拦截后的手动链接，自定义官网地址使用构建期 `NEXT_PUBLIC_FRONTEND_URL`。
- 后台调度器默认每 30 秒检查到期内容，发布后清理 Redis 内容缓存并调用官网 `/api/revalidate` 清理 ISR。
- 产品与新闻核心字段写入不可变 `ContentRevision` 快照；查看和恢复通过各资源的 `/admin/products|news/{id}/revisions` 路由提供，恢复本身会继续生成新版本。
- 后台可签发默认 15 分钟有效的预览令牌；官网 `/preview/[token]` 强制 `noindex`、`no-store`，不改变正式页面视觉与正式 URL。
- 最新迁移为 `16_20260908090000_backend_reliability.py`：新增持久化后台任务表与账户 `session_version`。15 号迁移补齐产品和新闻 `sort_order`；生产仍由独立 migrate profile 执行 `aerich upgrade`，不删除或重建已有卷。

## 官网数据与错误处理

- 公开页面通过 FastAPI 获取产品、新闻、分类与设置；写入后由后端统一失效列表、详情、旧 slug、Redis 与 ISR 缓存。
- `ApiError` 保留 HTTP `status`、业务 `code`、请求 `path` 和原始 `cause`。
- 产品详情仅将 HTTP 404 或业务码 `A010001` 视为不存在并进入标准 `notFound()`；网络、429、500、502 和非法响应显示可重试的暂不可用状态，不再伪装为 `Product Not Found`。
- 产品详情使用 React `cache()` 去重；静态生成限制并发，避免批量预渲染时触发后端每 IP 限流。
- 新闻详情同样区分不存在与服务故障，使用 React `cache()` 去重；错误边界通过 `retry()` 重新获取服务端数据。发布日期保留原始 ISO 时间，未知修改时间不写入元数据；sitemap 运行时完整读取公开 URL，失败时不返回缺失动态内容的成功结果，产品修改日期使用真实更新时间。
- 官网服务端设置读取复用公共 API 客户端，遵循 `INTERNAL_API_URL`；浏览器仍使用公开地址。
- 产品卡片和详情图库保留 `object-contain`，已移除额外大内边距，保证产品主体不裁切且不远离边框。

## 管理后台媒体与认证

- 登录、刷新和退出只使用 HttpOnly Cookie；生产环境额外启用 `Secure`，浏览器 JavaScript 不读取或保存 JWT。
- 同一页面的并发 401 合并刷新，退出等待进行中的刷新完成；暂时性刷新故障不会伪装为正常退出。后台页面校验 access scope 与必要声明，生产缺少 JWT 密钥时拒绝访问；失效会话可直接进入登录页。
- access Cookie 失效但 7 天有效的 refresh Cookie 仍在时，页面入口会直接向后端换取新会话并把 `Set-Cookie` 写回响应，放行到原目标页面（同一 refresh 会话并发去重）；仅 refresh 真正失效或后端不可达才跳登录页并带 `expired=1`。
- 登录表单显式声明 `method="post" action="/signin"`：脚本未加载或尚未被 React 接管时，浏览器原生提交也走 POST，用户名与口令不会进入 URL、历史记录或访问日志。
- 新闻管理使用管理员分页接口，包含草稿和定时内容。列表排序保留未显示项的位置及未保存草稿；批量写入最多并发 3 项，等待全部结果后报告失败并保留可重试项。仪表盘产品与新闻总数来自现有统计接口。
- 后台媒体使用 `resolveMediaUrl()`：相对 `/uploads/...` 保持同源，由 Next.js rewrite 转发到后端；外部绝对 URL 原样保留。
- 媒体库每条上传记录都可以通过 `GET /api/v1/admin/upload/{id}/usage` 查询引用明细，覆盖产品图库、产品封面、新闻封面，以及产品和新闻正文（`content_html`）中的 `<img>` 引用（对应 `product_content` / `news_content` 类型）；比较前统一归一化媒体 URL，同一图片的相对/绝对地址都能命中，并从弹窗跳转到对应的产品/新闻编辑页；后端删除接口仍会阻止未确认的被引用素材删除。
- 产品与新闻编辑表单上传图片时，会按 `categorize=product:{slug}` / `categorize=news:{slug}` 自动归入媒体库的 `Products / {slug}` 或 `News / {slug}` 子相册；未填写 slug 的上传进入“未分类”。相册只改变逻辑归属，不改变媒体 URL，文件本身仍由后端存储后端管理。侧边栏相册计数为**子树合计**：`GET /admin/albums` 同时返回直系 `count` 与含全部子相册的 `total_count`，界面显示后者；按相册筛选上传记录时同样包含其全部子相册，避免“大类恒显示 0”和“显示数量与列表不一致”。
- 媒体库提供“同步引用图片”和“自动归类”：前者为已有产品/新闻引用但缺少 `UploadRecord` 的 URL 补齐记录，后者仅按既有媒体 URL 路径规则整理未分类记录。
- 禁止在组件中重新拼接 `http://localhost:8000`，否则会破坏 Windows、Docker 和生产域名兼容性。
- 产品/新闻编辑页包含内容状态、发布时间、版本历史、恢复和短期预览入口。

## 系统设置与第三方统计配置

- 管理后台 `/settings` 通过同源代理调用 `/api/v1/admin/settings`。`ga_id`、`clarity_id`、联系邮箱、SMTP 主机等普通配置保存后明文回显；GA4 和 Clarity 只填写对应 ID，不填写完整安装脚本。
- 官网仍由现有的分析同意与运行时设置流程加载 GA4/Clarity；`ga_id` 或 `clarity_id` 留空即可关闭对应工具。本次后台回显修复没有新增统计脚本，也没有改变官网的同意逻辑。
- 设置页只提交相对当前服务端值发生变化的字段，并在保存成功后同步 SWR 缓存；服务端刷新不会覆盖用户正在编辑的字段，避免旧缓存或竞态读取把已保存值显示为空。
- 设置读取失败时显示可重试的错误状态；未确认到设置数据时禁止保存。保存成功但后续重新读取失败时，页面保留已保存值并提示重试。
- 公开设置修改与缓存刷新任务同事务提交，提交后清理 Redis 和官网 public-settings 缓存，失败由现有任务机制重试。Google 站点验证码已接入官网服务端 metadata，后台明确留空会移除验证标签。
- 设置页按真实消费位置说明生效范围；未接入官网的历史站点名称、公司名称、Logo、传真及社交配置保留为只读，避免误以为保存即应用。SMTP 普通字段留空仍回退部署环境配置，不能作为停发开关；测试发送会先保存本页修改，成功响应允许 data 为 null。
- `smtp_password` 是唯一按敏感值处理的设置：后端返回 `******`，界面使用密码输入框并显示“已配置”；留空或不修改时保留原授权码，新授权码保存后也不会明文回显。
- 上述回显、局部提交和错误处理改动只涉及 `admin-next` 设置页，不涉及数据库结构、设置 API 协议或官网统计脚本。

## 现有业务与官网能力

- 询盘记录国家/地区、来源产品、落地页、来源页和 UTM 归因；产品 CTA 通过 `?product=<slug>` 预填来源产品。
- 询盘表单在相同内容失败重试时复用业务单号，成功或内容变化后更新单号；字段长度与后端对齐，数量和留言合并校验。单选项支持键盘操作，隐藏字段错误自动展开，提交期间禁止重复编辑。
- 公开 `POST /inquiries` 只返回最小回执（`biz_req_no`、`received`、`status=RECEIVED`、`submitted_at`），不返回姓名/邮箱/留言、`smtp_status`、标签、负责人 ID 与跟进记录；同一 `biz_req_no` 内容一致的重复提交幂等返回同一回执，内容不一致返回 `C400001` 且不回显既有询盘。内部 CRM 字段只在后台接口可见。
- 后台询盘跟进表单等待完整详情后才允许编辑与保存，读取失败提供重试；关闭或切换记录会使旧响应失效，避免备注、状态和国家串入另一条询盘。备注输入遵循后端 1,000 字符限制。
- 后台通知覆盖新询盘、超过 24 小时未跟进和 SMTP 失败，并通过 `NotificationReadState` 记录用户级已读状态。
- 搜索使用 PostgreSQL TSVector；缺少 `zhparser` 时降级 `simple`，本地 SQLite 走 LIKE 降级。联合搜索在数据库分页前按“产品分组优先，新闻分组随后”排序，新闻组按 `created_time DESC, id DESC`；降级提示固定为英文 `Basic search mode`。产品结果直接返回规范嵌套 URL（`/products/{category}/{slug}`）并附带 `category_slug`，分类缺失时回退扁平地址，前端不再自行拼接产品路径。
- 审计日志关键字搜索在**分页前**于数据库过滤 `username` / `action` / `resource` 并返回过滤后的 `total`，后台不再只过滤当前页。
- 官网 SEO 使用规范 URL、sitemap、robots、Open Graph、Twitter Card 和 JSON-LD；组织类型为 `Manufacturer` 并使用统一 `@id`。默认社交图为 1200×630 的 `public/og/og-default.jpg`，产品与新闻详情有内容图时优先使用、无图时显式回退默认图。产品与新闻列表页按有效 `page` 生成自身 canonical（保留分类参数、`page=1` 去掉该参数），非法或非数字页码按首页处理，超出总页数时回落到首页并输出 `robots: noindex`。
- `/llms.txt` 作为实验性 AI 站点导览按小时再验证；它明确区分 2023 年成立的 Songdian Technology 法律实体与 2006 年开始的集团制造历史，不视为正式标准或排名保证。
- 当前工厂视频仅在 About 页面展示，使用 WebP poster、`preload="none"` 和可选 WebM source；视频、poster 与默认 OG 图均属于随 frontend 镜像发布的静态源码资产。
- 官网资源加载采用“首屏优先、非关键资源按需”的策略：Hero/Logo 等关键图片使用 `next/image` `preload`，`SafeImage` 默认使用 `loading="lazy"`，About 的时间轴/证书画廊使用 `next/dynamic` 分包，工厂视频使用 `preload="none"`。Contact 地图在距视口 200px 时挂载客户端动态组件，保留手动加载入口和失败重试；可配置地址以文本节点写入地图弹窗。
- 官网 Header 在 `lg` 断点显示桌面导航、搜索和报价 CTA，较窄视口使用移动菜单，避免平板端搜索框挤压导航；站内导航链接使用 `scroll={false}` 配合显式顶部重置，确保从任意滚动位置跳转到新页面都从首屏开始。About 页首屏顺序为 `Who We Are / Our Story`，`Our Journey` 位于下一段。
- 首页 Hero 在 `xl`（≥1280px）宽屏使用上左对齐，内容仍沿 `site-container` 左侧基线；标题内容列放宽至 980px，避免 1920px 视口不必要的换行。底部 CTA 与 Scroll 提示避开固定 56px 询盘栏；平板和手机保留自然流式布局，并在 1024px、390px 视口验证无横向溢出。
- 官网即时搜索聚焦时只显示一层品牌红边框，避免全局焦点环与输入框边框叠加；页脚四个社交图标统一占用 `44×44px` 槽位，链接状态不会改变图标间距。
- 即时搜索在输入变化时立即使旧响应失效，加载期间不允许选择旧建议；错误保持可重试，Escape 只关闭建议框而不清空关键词，关闭后 Enter 提交当前关键词。列表 ARIA ID 按组件实例唯一生成。
- 联系页地图、Cookie 横幅和底部询盘栏在移动端协调显示，不产生横向溢出。产品分类与 FAQ 移动目录提供横滑提示、边缘控制和 sticky 定位；首图预加载、结构匹配骨架、触屏反馈和 `prefers-reduced-motion` 已统一。

## 可靠性、质量与发布

- 生产要求真实 Redis（`REDIS_REQUIRED=true`）；`/readyz` 同时探测 PostgreSQL 和 Redis，任一关键依赖不可用即阻止发布。
- CI 运行后端 Ruff/pytest、前后台 lint/build、SEO 校验、真实 PostgreSQL/Redis 迁移测试、Playwright 关键链路、Lighthouse 阈值与依赖审计。GitHub Actions 已统一使用 node24 运行时的 action 最小必要版本（checkout@v5、setup-node@v5、setup-python@v6、setup-uv@v7、upload-artifact@v6、docker 系列 buildx/login v4 + metadata v6 + build-push v7），仅用于消除 Node 20 弃用告警，job 结构、needs、门禁条件与发布逻辑未变。
- 官网与管理后台均为 Next.js **16.3.4**；Playwright 套件在 `frontend/e2e/`（12 个 spec，44 个用例），管理后台用例也在同一套件内。
- **E2E 交互用例统一等待 React 注水**：`page.goto()` / `page.reload()` 在 window load 就返回，此时 DOM 可读写但事件处理器尚未挂载，直接交互会产生「操作无效、无请求、无报错」的假失败。用例通过 `frontend/e2e/hydration.ts` 的 `gotoHydrated()` 打开页面、`waitForHydration()` 在 `reload()` 后补等待；不使用 `waitUntil: "networkidle"`（开发模式下网络静默早于注水完成）。用例在本地 dev 模式下使用 `localhost` 而非 `127.0.0.1`（Next 开发服务器对 `/_next/*` 的同源校验会对后者返回 403，导致页面不注水）；CI 以生产构建（`next start`）启动服务，不受此限制。`playwright.config.ts` 固定 `workers: 2`，避免本机多 dev server 并存时因机器过载出现 teardown 超时。用例夹具必须在 `finally` 中清理（逐条容错，不因清理失败掩盖原始失败），避免残留内容进入官网或污染下一轮断言。
- **管理后台表单下拉为自绘 listbox（SelectField）**：e2e 断言当前值用触发器的 `data-value`（不是 `toHaveValue`），打开下拉先断言 `aria-expanded="true"`，选项限定在 `getByRole("listbox", { name: "X options" })` 作用域内（触发器用 `getByRole("button", ...)` 定位，`getByLabel` 会因子串匹配误命中 listbox）；交互与滚动行为约定详见 `frontend/AGENTS.md` 的「自绘下拉与 e2e 约定（2026-09-12）」。本地手工跑 e2e 还需环境对齐：三服务同 `JWT_SECRET`、后端配置 `NEXT_REVALIDATE_URL`/`REVALIDATE_SECRET` 并对 localhost 关闭系统代理（`NO_PROXY`），否则会出现与代码无关的假失败。
- 官网图片优化器访问 loopback/局域网地址由 `ALLOW_LOCAL_IMAGE_OPTIMIZATION` 控制，且与 `NODE_ENV !== "production"` 做与运算：**生产构建即使显式设为 `true` 也恒为 `false`**，本地开发指向 loopback 后端而未开启时启动告警。
- Web Vitals 仅在用户同意 Analytics 且 GA4 已配置时上报 LCP、CLS、INP、FCP 与 TTFB，不增加身份信息采集；撤回同意后 `trackEvent()` 会先读当前同意状态，并立即停用已加载的 GA（禁用标记 + Consent 拒绝信号），再次接受后恢复。
- 生产发布先备份 PostgreSQL 与 `uploads_data`，再运行迁移、切换三个应用并冒烟；应用镜像可自动回滚，数据库迁移不会自动反向回滚。备份文件名带时分秒与可选发布号（`db_YYYYmmdd_HHMMSS[_RELEASE_ID].sql.gz` 与同名 uploads 包），同日多次部署不会互相覆盖。
- 生产数据和运行时上传媒体不进入 Git；静态工厂视频属于前端源码资产，随镜像发布。

## 后端可靠性修复（2026-09-08）

- 产品 SEO、新闻封面已纳入创建/更新；未提交的字段保留，显式 null/空字符串按字段语义清空，标签用空数组清空。
- 询盘幂等以数据库唯一约束为准；询盘和邮件任务同事务创建。记录以 `smtp_status=PENDING` 落库并立即返回，后台每 5 秒轮询，SMTP 未配置时每 5 分钟延后且不消耗失败次数；已发生失败最多尝试 5 次，指数退避，最终 FAILED 保留供处理。（2026-09-12 起公开响应改为最小回执、不再回显 `smtp_status`，见下方「一致性与运维修复」。）
- 产品/新闻修改、版本记录、搜索向量和缓存失效任务同事务提交。提交后立即尝试失效 Redis 与 ISR；失败留在任务表重试。分类变更同时清除嵌入分类信息的详情缓存，内容变更清除搜索缓存。
- CRM 跟进、分配、状态和标签更新通过事务及行锁保护；字段定向保存，避免旧对象覆盖跟进记录。
- 产品/新闻恢复已发布或定时版本、修改已发布内容需要 publish 权限；产品图库/规格写入遵守相同边界。用户管理改为 role:update 权限。
- 改密/重置密码使旧 access/refresh 同时失效；刷新令牌族通过 Redis SET NX 原子消费。权限实时查库，避免撤权后的缓存回填竞争；生产 JWT_SECRET 最少 32 字节。
- 限流在执行前解析真实 IP，计数与过期时间原子写入 Redis；搜索缓存包含 page_size。仪表盘、产品分类计数使用数据库聚合，角色权限批量预取。
- 上传最多读取单文件限额 + 1 字节，再校验内容；文件写入移入线程。SMTP 支持 465 SSL、587 STARTTLS 及逗号分隔收件人。
- CI 增加真实 PostgreSQL/Redis 事务、并发、任务租约与迁移兼容性检查。实现细节和运行边界见 reports/backend-review-2026-09-08.md。

## 一致性与运维修复（2026-09-12）

- 产品 URL 规范化改为运行时数据驱动：`frontend/proxy.ts` 调 `GET /api/v1/products/{slug}/canonical` 取当前分类后 308；改分类即时生效，仅当后端以业务码 `A010001`（未发布/不存在）明确响应时才不回退旧映射（否则会把已下架产品重定向到旧分类地址）。后端不可达、或后端尚未提供该接口（未知路由返回 `C404001`）时仍走构建期 `lib/generated/canonical-map.ts` 兜底，避免灰度/回滚期间旧扁平地址断链；生成脚本按 `page_size=50` 翻页取全量（后端单页上限 50）。
- 媒体静态目录纵深防御：backend 容器启动脚本 `scripts/start.sh` 在 uvicorn 之前把 `uploads/products|news|2026` 图片目录同步进 `uploads_data`，并清理媒体根目录残留的 `.py` / `.env` 等代码与配置文件（同步逻辑放在脚本文件内而非 compose 字符串 command——compose 对 `$` 与括号做插值/shlex 处理会吞掉转义，曾导致生产容器 `sh: 1: Syntax error: "(" unexpected`）；`main.py` 的 `_MediaStaticFiles` 对 `.py` / `.pyc` / `.env` / `.sh` / `.toml` / `.sql` / `.log` / `.md` 等后缀统一返回 404。
- 分类删除一致性：存在未删除关联内容时拒绝删除并返回关联数量（`C400001`，`data.conflict=true`）；另提供 `POST /admin/categories/{id}/migrate-and-delete` 与 `POST /admin/news-categories/{id}/migrate-and-delete`，在同一事务内迁移内容后软删分类。后台产品分类页提供「迁移并删除」入口；新闻分类迁移接口已就绪，后台暂无独立管理页。
- 内容缓存加入版本号（`common/cache_version.py`）：读详情前取「资源级 + slug 级」版本快照，回填缓存前复读校验，版本变化即放弃回填；写入递增 slug 级版本，分类等批次变更递增资源级版本。Redis 不可用时静默退化为无版本校验，纯 Redis 实现，无数据库迁移。
- 封面上传纳入保存忙碌态：产品/新闻表单上传期间禁用保存按钮与表单字段，并用递增请求序号保证连续选择时只接受最后一次上传结果。
- 新增回归测试 `backend/tests/test_media_albums.py`（相册子树计数、按子树筛选、rollup 口径，共 3 项）；后端全量 `pytest tests/ -q` **132 项通过**。

## 发布前必须确认

1. 所有新增源码、迁移、测试、预览和内容工作流文件已纳入同一个 commit；不得只提交已跟踪文件。
2. `.env`、`.env.local`、Cookie、数据库、上传卷和运行日志不得进入发布 commit。
3. 产品 URL 规范化由 `frontend/proxy.ts` 在运行时调用 `GET /api/v1/products/{slug}/canonical` 解析当前分类，后台改分类无需重新生成映射；`npm run gen:map` 只在需要刷新“后端不可达”时的过渡兜底映射时手动执行，产物可一并提交，不属于发布前置条件。
4. 在 GitHub Actions Variables 配置生产 `NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_IMAGE_HOST`；根目录 `.env` 不会改写已经构建好的 GHCR 前端镜像。
5. GitHub Actions 的 `CI` 中 `backend`、`frontend`、`admin`、`compose`、`migration`、`e2e`，以及同一 commit 的 `images` 矩阵三项均成功后，才允许发布；`images` 被跳过时不能部署。
6. 从 GitHub commit 详情页复制 40 位完整 SHA；手动发布时在服务器执行 `git pull --ff-only origin master` 后，用 `git rev-parse HEAD` 与目标 SHA 核对一致，再执行 `scripts/deploy.sh`。
7. 发布后必须检查 Compose 服务状态、`/readyz`、官网、管理后台、`/llms.txt`、默认 OG 图和视频 Range 响应；完整命令以 [`deploy-guide.md`](./deploy-guide.md) 的手动部署章节为准。

## 仍属于后续工作的事项

对象存储/CDN、多机横向扩容、数据库迁移自动回退、销售转化分析和更细粒度 RBAC 尚未实现；实施前需单独评估并更新本文档。
