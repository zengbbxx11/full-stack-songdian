# 当前实现总览（2026-09-16）

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
- `apiFetch` 统一 10 秒超时（覆盖连接建立与正文读取），失败仍抛 `ApiError`；显式 signal 会让该请求退出 Next 原生请求级 memoization，详情去重继续由领域层的 React `cache()` 承担。
- Products 与 News 列表共用 `lib/list-query.ts`：重复 `category` / `page` 参数明确取第一个值，非安全整数或小于 1 的页码回退第一页；metadata 与正文使用同一解析口径，第一页不写 `page` 参数。该改动同时修复了 Products 对数组参数调用 `toLowerCase` 的异常。
- `lib/api/list-pages.ts` 用 React `cache()` 在单次渲染内共享分类与列表结果并保持同一成败状态：分类或列表接口失败时不再回退为「无筛选的全部内容」，而是返回英文故障提示页并输出 `noindex`，Retry 使用保留当前分类与页码的完整页面导航；产品数量不可读时显示破折号。底层 60 秒数据缓存与发布失效标签未变。
- sitemap 不再使用 `force-dynamic`，改为 `await connection()` + `unstable_cache`（60 秒，tags 为 `products` / `news` / `product-categories`）；分页不完整直接失败，不缓存残缺 URL 集，发布继续通过既有标签链路主动失效。
- 结构化数据口径调整：组织与制造商统一输出 `Organization`（不再用 `Manufacturer`），作者为公司时文章作者同样使用 `Organization`；询盘产品没有公开价格与库存，`productSchema` 不再输出未经确认的 Offer，只保留规范 URL。

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
- 产品编辑页新增「商品详情图」区块：从 `content_html` 抽取 `img` 形成可编辑列表，支持多图上传（上传前读取原始宽高）、说明文字、上移/下移与移除，编辑结果回写 `content_html`；上传期间禁用保存。2026-09-17 补齐交互：多选与拖拽上传、逐张进度（`正在上传第 x/y 张…`）、移除二次确认、空态引导，以及「详情图有未保存改动」时的 `beforeunload` 提示与「取消」拦截（保存成功后复位）。
- 新闻正文编辑器（`admin-next/src/components/form/RichTextEditor.tsx`）通过「从媒体库插入图片」插入带 `alt` 与原始宽高的 `<img>`（读原图尺寸，供官网做响应式与懒加载）；上传期间禁用保存。2026-09-22 起该编辑器改为纯 HTML 代码编辑器，插图落在代码光标处，并带右侧沙箱预览（见「新闻正文改为纯代码编辑器 + 沙箱预览（2026-09-22）」）。详情图仍存储在产品正文中，复用既有媒体、版本历史与发布缓存刷新链路，封面与图库保持独立；官网产品详情页按顺序纵向只展示图片，原有文字保留在数据中。

## 系统设置与第三方统计配置

- 管理后台 `/settings` 通过同源代理调用 `/api/v1/admin/settings`。`ga_id`、`clarity_id`、联系邮箱、SMTP 主机等普通配置保存后明文回显；GA4 和 Clarity 只填写对应 ID，不填写完整安装脚本。
- 官网仍由现有的分析同意与运行时设置流程加载 GA4/Clarity；`ga_id` 或 `clarity_id` 留空即可关闭对应工具。本次后台回显修复没有新增统计脚本，也没有改变官网的同意逻辑。
- 设置页只提交相对当前服务端值发生变化的字段，并在保存成功后同步 SWR 缓存；服务端刷新不会覆盖用户正在编辑的字段，避免旧缓存或竞态读取把已保存值显示为空。
- 设置读取失败时显示可重试的错误状态；未确认到设置数据时禁止保存。保存成功但后续重新读取失败时，页面保留已保存值并提示重试。
- 公开设置修改与缓存刷新任务同事务提交，提交后清理 Redis 和官网 public-settings 缓存，失败由现有任务机制重试。Google 站点验证码已接入官网服务端 metadata，后台明确留空会移除验证标签。
- 设置页按真实消费位置说明生效范围；未接入官网的历史站点名称、公司名称、Logo、传真及社交配置保留为只读，避免误以为保存即应用。SMTP 普通字段留空仍回退部署环境配置，不能作为停发开关；测试发送会先保存本页修改，成功响应允许 data 为 null。
- `smtp_password` 是唯一按敏感值处理的设置：后端返回 `******`，界面使用密码输入框并显示“已配置”；留空或不修改时保留原授权码，新授权码保存后也不会明文回显。
- `GET /api/v1/admin/settings` 的**读取范围随权限收缩**（2026-09-17）：接口仍只需登录，但无 `settings:update` 的账号只会拿到 `PUBLIC_SETTING_KEYS` 白名单项，`smtp_host`/`smtp_user`/`inquiry_email_from`/`inquiry_email_to` 不再出现在响应里；采「默认拒绝 + 白名单裁剪 key」而非逐字段掩码（设置页只对 `smtp_password` 的 `******` 做“不修改”跳过，抹其它字段会被当真实值回写）。具备权限的账号行为不变，未新增权限码、未改种子与前端。
- 上述回显、局部提交和错误处理改动只涉及 `admin-next` 设置页，不涉及数据库结构、设置 API 协议或官网统计脚本。

## 资源、缓存与进程配置（2026-09-15 / 09-16）

- 后端公开媒体（`/uploads/*`）的 200/206/304 响应新增 `Cache-Control: public, max-age=3600`，保留 ETag 与 Last-Modified，404 不加该头；原路径替换的图片存在一小时浏览器缓存窗口，替换图片建议使用新 URL。若 OpenResty 直接服务 `uploads` 或覆盖响应头，需在反代层对齐同一策略。
- backend 容器启动脚本 `scripts/start.sh` 统一承担启动前准备：同步镜像内置图片目录到媒体卷、清理媒体根目录残留的代码与配置文件，再解析 `TRUSTED_PROXIES` 并以 `WEB_CONCURRENCY`（默认 2）启动 Uvicorn。每个 worker 各自持有数据库连接池与后台任务循环，减少进程可降低重复常驻开销，但内存与吞吐需以实测为准。
- Compose 各服务统一 `json-file` 日志轮转（单文件 10m、最多 3 个）；frontend 命名卷 `frontend_image_cache` 只持久化 `/app/.next/cache/images`，不持久化 HTML/ISR 缓存。
- `frontend/proxy.ts` 的 canonical 查询限时 2 秒，且只有后端以 `code === "0"` 明确返回规范路径才算解析成功（避免把「HTTP 200 但业务失败」当作成功）；进程内缓存 60 秒、上限 512 条，写入时清理过期条目并在满容量时淘汰最早插入项，避免随机 slug 无限增长。
- 上述资源与缓存改动均为应用层与授权层配置，未新增数据库迁移。

## 官网内容呈现与内链（2026-09-16）

- 产品详情页新增独立详情图区块（`components/ProductDetailImages.tsx`）：只从 `content_html` 抽取 `img` 的 src/alt/width/height；本地 `/uploads/` 且带有效 `width`/`height` 的图片走 `next/image` 懒加载与响应式 `sizes`，本地但缺宽高、旧图与外链图降级为原生 `<img>`，不扩大图片优化器的远端主机白名单。
- 新闻详情页底部新增相关产品内链（`components/NewsProductLinks.tsx` + `lib/news-product-links.ts`）：从正文可见文本匹配产品 slug / SKU / 名称首个型号，命中优先，否则回退 `lib/priority-products.ts` 的主推型号顺序，最多 3 条；无分类产品不生成非规范链接，关联目录读取失败时仍保留 OEM/ODM、工厂与询盘入口。
- 主推产品（DC403 / DC105 / DC325 / DC417X）在 `lib/priority-products.ts` 提供基于现有规格的 SEO 默认标题与描述，后台显式 SEO 仍优先；BK05 / GO7 按业务要求暂缓，未纳入当前主推列表。工厂产能口径使用已确认的 10 条生产线，但 CMS 新闻 `songdian-manufacturing-oem-partner-for-kenko` 仍存在旧口径，属待内容修正项，本轮未改数据库。
- 询盘来源产品上下文拆为独立客户端小岛（`components/form/InquiryProductContext.tsx`）：`?category=` 能直接映射兴趣项时不再请求接口，否则调后端 canonical 接口取分类；请求带 5 秒超时，失败时保留产品引用与手动选择，表单本体仍为服务端渲染。
- 首屏资源减负：新闻卡片关闭链接自动预取（`prefetch={false}`），Header、Footer、首页 CTA 与即时搜索等入口同步关闭预取；移除多余的 Geist Mono 字体；页脚社交图标改为与显示尺寸匹配的 60px WebP；产品图库与新闻卡片的 `sizes` 按实际容器重新校准。以上属本地已完成、待发布，线上资源基线见 [reports/home-resource-audit-2026-09-16.md](./reports/home-resource-audit-2026-09-16.md)。

## 产品详情页改版：移动端主图放大 + 关联产品后台手选（2026-09-18）

- 移动端（<640px）产品主图从 180px 提到 260px：缩略图条改为绝对定位叠加在主图底部（`components/ProductGallery.tsx` 新增可选 prop `thumbsOverlayOnMobile`，`max-sm` 与组件自身 `sm:flex-row` 断点严格互补），省下的 76px 全部让给主图；顺序仍是 型号 → 主图 → 询盘/返回（并排一行）→ 简介要点 → OEM 说明，询盘按钮底部实测 632px，仍满足既有「首屏 650px」约束（`e2e/product-news-upgrade.spec.ts`）。640–1023px 保持 300px，≥1024px 仍是正方形；无主图占位框与 `loading.tsx` 骨架同步。
- 主图容器由 `aspect-square` + 高度上限推导为**正方形**，因此主图 `sizes` 按图高声明（`min(100vw - 32px, 260px)`）：沿用按容器宽度声明的旧值会选到约 1.8 倍大的候选图（`e2e/responsive-images.spec.ts` 会判为过量下载）。
- 相关产品（Related Products）由「同分类自动取 4 条」改为**后台手选**：新增 `t_product_related`（`ProductRelated` 模型 + 17 号迁移，含 `UNIQUE(product, related)`、`(product, sort_order)` 与 `(related)` 索引）。写入复用 `POST/PUT /api/v1/admin/products` 的 `related_product_ids`（去重保序、上限 4、不允许自关联、已删除目标静默剔除、完全不存在的 id 报 400），读取走详情 VO 的 `related`：公开详情与预览只含 PUBLISHED 目标，后台详情返回全部已保存目标供选品器回填。关联为**单向**；未配置关联的产品**不渲染**该区块。
- 关联是反向依赖：目标产品被改标题/封面/slug、上下架、定时上架或删除时，`services._referrer_slugs` 会反查引用方并一并失效其详情缓存，避免前台残留旧卡片或死链（`tests/test_product_related.py::test_related_target_change_invalidates_referrer_cache`）。
- 后台产品编辑页新增「关联产品（0/4）」区块：关键字搜索（250ms 防抖，`/admin/products?keyword=`）→ 添加；已选项按展示顺序上移/下移/移除，非 PUBLISHED 目标标注「未发布，前台不显示」。关联改动最长 60 秒内在官网生效（后端缓存失效 + 详情页 ISR 60s）。
- 注意：关联不进入 revision 快照，恢复历史版本不回滚关联（与图库/规格的既有约定一致）；上线后若 Redis 里已有旧版详情缓存，最多 1 小时内该产品可能暂不显示相关产品区块（旧缓存结构缺 `related`，自然过期自愈）。

## 官网移动端图片版式 + 后台两个编辑器优化（2026-09-18）

- 移动端产品图集（`components/ProductGallery.tsx` 新增可选 prop `thumbsSideOnMobile`）：从「缩略图条叠在主图底部」改为「左侧 260×260 主图 + 右侧竖排 56×56 缩略图」（4 张列高 248px ≤ 主图高，图集整体高度仍 260px），询盘按钮底部实测 632px，仍满足 650px 首屏约束；主图、缩略图与加载骨架（`app/products/[...slug]/loading.tsx`）三处版式同步，640px 起维持「左缩略图列 + 右主图」不变。
- 移动端产品卡片（`components/ProductCard.tsx`）图片容器由手机端 `aspect-[4/3]` 改为 `aspect-square`：真实产品主图全部是 1:1，旧版 4:3 容器 + `object-contain` 必然在左右留出 `#f2f3f4` 灰底；改正方形后既不裁图也无灰边（卡片高度约 +40px）。
- 后台「商品详情图」编辑器（`admin-next/src/components/form/ProductDetailImageEditor.tsx`）呈现层重做：说明 + 「选择文件」主按钮 + 缩略图网格（序号徽标、原始尺寸、说明输入、图标化上移/下移/移除）+ HTML5 拖拽排序（落点蓝色描边；拖文件仍走整块投放区上传，用 `dataTransfer.files` 区分两类拖拽）+ 上传进度/失败清单/二次确认/空态引导。既有可访问名与文案（商品详情图、上传商品详情图、详情图 N 说明、上移、下移、移除此图、移除、暂无详情图、正在上传第 x/y 张、也可以把图片直接拖进这块区域）逐字保留，作为 e2e 契约。
- 后台新闻正文编辑器（`admin-next/src/components/form/RichTextEditor.tsx`）新增「可视化 / HTML 源码」双标签（默认可视化，保证既有定位与断言）：源码模式用等宽 textarea 直接编辑同一份 `content_html`，可粘贴完整 HTML 代码来确定内容与格式；工具按钮图标化（lucide 替换 emoji）；编辑器内标注允许的标签与「内联 style 会被清除，版式由站点 CSS 接管」。（该双模式已在 2026-09-22 的改造中整体删除，见下一节。）
- 后端 `common/html_cleaner.py` 的 `ALLOWED_TAGS` 增加 del/figure/figcaption/mark/s/small（前台渲染白名单本就允许这几类，此前只在入库时被剥掉），`ALLOWED_ATTRIBUTES` 与协议白名单不变；新增 `tests/test_html_cleaner.py` 固定「语义标签保留 + script/style/on*/javascript: 仍被清除」两侧行为；前台 `lib/html-cleaner.ts` 同步补 `del`。

## 新闻正文改为纯代码编辑器 + 沙箱预览（2026-09-22）

- 后台新闻正文编辑器（`admin-next/src/components/form/RichTextEditor.tsx`）从「可视化 + HTML 源码」双模式改为**纯 HTML 代码编辑器**：删除 `mode`/`TABS`/`TOOLS`/`document.execCommand`/`contentEditable` 挂载与隐藏、选区保存与还原、mode 守卫等全部补偿逻辑，只留一个受控等宽 textarea（`aria-label="HTML 源码"`、`spellCheck=false`、可纵向拉伸）。顺带消掉一个既有隐患：原可视化区执行 `el.innerHTML = value`，粘贴带 `onerror` 的图片会在后台页面里触发脚本；代码模式不再把内容当 HTML 解析。同时删除从未被调用的 `upload` prop、`insertImages` 与隐藏 file input。
- 插图改为「从媒体库插入图片」→ 媒体库选择器（多选、可在选择器内上传）→ `measureImage` 读原图宽高 → 在 **textarea 光标处**插入 `<img src alt width height>`（多张按选择顺序各占一行），插入后光标落在插入内容末尾。textarea 的 `selectionStart/selectionEnd` 失焦后依然保留，因此不再需要旧版「存 Range → 还原选区」的绕行。宽高必须带：官网据此预留比例防 CLS。
- 新增右侧实时预览（`admin-next/src/components/form/ArticlePreviewFrame.tsx` + `admin-next/src/lib/article-html.ts`）：≥1024px「代码 / 预览」并排（表单容器在 ≥1280px 放宽到 `max-w-3xl xl:max-w-5xl`），窄屏自动上下堆叠。**安全口径**：预览渲染在 `<iframe sandbox="">`（无 `allow-scripts`、无 `allow-same-origin`）里，`srcDoc` 内嵌 CSP（`default-src 'none'`、`img-src <运行时 origin> data:`、`style-src 'unsafe-inline'`、`form-action`/`base-uri` 均为 `'none'`）—— 这是本次的强制边界，预览链路上**不出现任何 `dangerouslySetInnerHTML`**；清洗只负责保真，用仓库既有的 `sanitize-html@^2.17.7`（与 `frontend` 同库同版本），白名单取**后端 bleach 与官网 sanitize-html 的交集**（只预览「能真正落到官网上」的内容：去掉 `video`/`source`/`section`/`tfoot`/`caption`/`colgroup`/`col`、`td`/`th` 的 `colspan`/`rowspan` 这些后端不放行的项，以及 `abbr`/`id`/`loading`/`decoding` 这些官网不放行的项；`a` 收敛为 `href`/`target`/`rel`，`img` 收敛为 `src`/`alt`/`title`/`width`/`height`），语义为「白名单外标签剥离标签、保留文本与合法子节点」（实测 `<foo>bar</foo>` → `bar`，与后端 bleach `strip=True` 一致；`script`/`style` 属 sanitize-html 的 nonTextTags、内容整体丢弃），协议仍限 http/https/mailto/tel 并给 `target=_blank` 补 `rel`；`img-src` **不放开外链 `https:`** 是有意取舍 —— 否则正文里的外链图会让后台浏览器直接请求第三方、成为可用的外发信标（代价是外链图在预览里不显示、官网仍正常）。其余已知差异（不清 WP/Astra 历史容器、不把 `/uploads/` 改绝对地址、不注入运行期属性）写在文件头。保存链路仍由后端 `clean_html` 权威清洗，客户端**不做**保存前清洗（避免"本地干净、入库另一份"的错觉）。
- 性能：输入 → `useDeferredValue` → 150ms 防抖 → 动态 `import()` 懒加载清洗器（`sanitize-html` 不进表单首屏 bundle）→ 更新 `srcDoc`；预览内容区独立滚动，不撑高整页。
- 范围：产品正文不受影响（仍是「商品详情图」结构块）；`MediaPicker`、新闻保存链路与其余字段未改动；既有可访问名（`从媒体库插入图片`、`HTML 源码`、`图片上传中，请稍候…`、`正文图片上传中...`）保留，作为 e2e 契约。
- 回归：`product-news-upgrade.spec.ts` 的两条新闻正文用例改写为「代码编辑器按光标插图」与「预览清洗 + 沙箱 + 保存原文」——后者把 `<script>`/`onerror`/`onclick`/`javascript:`/`svg onload` 写进正文，断言预览 DOM 里这些标签与属性全部不存在、`data-pwned` 标记未出现、父窗口 `window.__pwned` 仍为 `undefined`（脚本一次都没执行）、iframe 的 `sandbox` 必须为空串**、预览文档的 `window.origin` 必须是 `"null"`（不透明源，证明没有 `allow-same-origin`）、文档内嵌 CSP 必须含 `default-src 'none'`** —— 这三条独立于清洗层（清洗器把 `script` 删掉后，只靠"脚本没执行"无法证明沙箱生效），改坏沙箱即失败；最后断言 `PUT` 的 `content_html` 与代码框原文逐字一致；`admin-mobile.spec.ts` 的新闻表单窄屏用例改为定位 textarea 与插图按钮（≥40px 命中区），`content-lifecycle.spec.ts` 的新闻正文改用代码框填写。本地实测：`product-news-upgrade` 8 项、`admin-mobile` 7 项、`content-lifecycle` 2 项、`media-library-video` 2 项（共 19 项）全部通过，`admin-next` `tsc --noEmit` 干净。

## 现有业务与官网能力

- 询盘记录国家/地区、来源产品、落地页、来源页和 UTM 归因；产品 CTA 通过 `?product=<slug>` 预填来源产品。
- 询盘表单在相同内容失败重试时复用业务单号，成功或内容变化后更新单号；字段长度与后端对齐，数量和留言合并校验。单选项支持键盘操作，隐藏字段错误自动展开，提交期间禁止重复编辑。
- 公开 `POST /inquiries` 只返回最小回执（`biz_req_no`、`received`、`status=RECEIVED`、`submitted_at`），不返回姓名/邮箱/留言、`smtp_status`、标签、负责人 ID 与跟进记录；同一 `biz_req_no` 内容一致的重复提交幂等返回同一回执，内容不一致返回 `C400001` 且不回显既有询盘。内部 CRM 字段只在后台接口可见。
- 后台询盘跟进表单等待完整详情后才允许编辑与保存，读取失败提供重试；关闭或切换记录会使旧响应失效，避免备注、状态和国家串入另一条询盘。备注输入遵循后端 1,000 字符限制。
- 后台通知覆盖新询盘、超过 24 小时未跟进和 SMTP 失败，并通过 `NotificationReadState` 记录用户级已读状态。
- 搜索使用 PostgreSQL TSVector；缺少 `zhparser` 时降级 `simple`，本地 SQLite 走 LIKE 降级。联合搜索在数据库分页前按“产品分组优先，新闻分组随后”排序，新闻组按 `created_time DESC, id DESC`；降级提示固定为英文 `Basic search mode`。产品结果直接返回规范嵌套 URL（`/products/{category}/{slug}`）并附带 `category_slug`，分类缺失时回退扁平地址，前端不再自行拼接产品路径。
- 审计日志关键字搜索在**分页前**于数据库过滤 `username` / `action` / `resource` 并返回过滤后的 `total`，后台不再只过滤当前页。
- 官网 SEO 使用规范 URL、sitemap、robots、Open Graph、Twitter Card 和 JSON-LD；组织和制造商统一输出 `Organization` 并使用统一 `@id`（不再输出 `Manufacturer`）。
- 页面级 metadata 统一经 `frontend/lib/site-meta.ts`：该模块内完成 `next-super-meta` 初始化并导出 `superMeta`，避免站点 URL 依赖模块级状态或运行期环境变量（`npm run verify:seo` 会阻止绕过该入口）。frontend 容器的运行期环境（Dockerfile runner 阶段与 Compose `environment`）均注入 `NEXT_PUBLIC_SITE_URL`，缺失时页面 description / canonical 会静默丢失。
- `frontend/next.config.ts` 设置 `htmlLimitedBots: /.*/`：Next 默认只对匹配该正则的 UA 等待 metadata 就绪再响应，其它客户端先收不含 title / description / canonical 的外壳、元数据随后由 JS 补写；放宽后所有客户端（含 Lighthouse、各类不执行 JS 的抓取方）都能在首屏 HTML 中拿到完整 metadata，动态路由代价是首字节多等一次 metadata 解析。默认社交图为 1200×630 的 `public/og/og-default.jpg`，产品与新闻详情有内容图时优先使用、无图时显式回退默认图。产品与新闻列表页按有效 `page` 生成自身 canonical（保留分类参数、`page=1` 去掉该参数），非法或非数字页码按首页处理，超出总页数时回落到首页并输出 `robots: noindex`。
- `/llms.txt` 作为实验性 AI 站点导览按小时再验证；它明确区分 2023 年成立的 Songdian Technology 法律实体与 2006 年开始的集团制造历史，不视为正式标准或排名保证。
- 当前工厂视频仅在 About 页面展示，使用 WebP poster、`preload="none"` 和可选 WebM source；视频、poster 与默认 OG 图均属于随 frontend 镜像发布的静态源码资产。
- 官网资源加载采用“首屏优先、非关键资源按需”的策略：Hero/Logo 等关键图片使用 `next/image` `preload`，`SafeImage` 默认使用 `loading="lazy"`，About 的时间轴/证书画廊使用 `next/dynamic` 分包，工厂视频使用 `preload="none"`。Contact 地图在距视口 200px 时挂载客户端动态组件，保留手动加载入口和失败重试；可配置地址以文本节点写入地图弹窗。
- 官网 Header 在 `lg` 断点显示桌面导航、搜索和报价 CTA，较窄视口使用移动菜单，避免平板端搜索框挤压导航；站内导航链接使用 `scroll={false}` 配合显式顶部重置，确保从任意滚动位置跳转到新页面都从首屏开始。About 页首屏顺序为 `Who We Are / Our Story`，`Our Journey` 位于下一段。
- 首页 Hero 在 `xl`（≥1280px）宽屏使用上左对齐，内容仍沿 `site-container` 左侧基线；标题内容列放宽至 980px，避免 1920px 视口不必要的换行。底部 CTA 与 Scroll 提示避开固定 56px 询盘栏；平板和手机保留自然流式布局，并在 1024px、390px 视口验证无横向溢出。
- **首页 Hero 轮播（2026-09-21）**：最多 3 张，数据来自后台设置键 `home_banners`（公开设置，随 `GET /public/settings` 下发，写入后清理 Redis + 推送 ISR）。第 1 张是首屏主图（后台留空即回退 `MEDIA.heroBanner`，原有悬浮文字、按钮与 `next/image` `preload` 不变），第 2、3 张为纯图（可选整图链接）且**首次切到才挂载下载**，首屏字节不增加。槽位可选配 `mobileUrl`（art direction）：配了就用 `<picture>` + `<source media="(max-width: 767px)">` 只下载匹配的那一张（不走图片优化器，故产图标准限定体积）。指示点为极简白点（底部居中、位置固定 `bottom-24`、无底衬/描边/白环，仅一层 1px 极轻投影，当前张更大更亮；**纯白底图上仍不可辨，属已知限制**），**cookie 提示条可见时不渲染**；**单张时显示 Scroll 提示、多张时由指示点占用同一位置**；自动轮播 6s 且悬停/`:focus-visible`/移出视口/标签页隐藏时暂停、`prefers-reduced-motion` 与 `saveData`/2G/3G 不自动。手机 Hero 高度 `max(600px,72svh)`（露出下一屏），≥768px 760px，≥1024px「视口 − 顶栏」。后台管理入口：「设置 → 首页轮播」面板（`admin-next/src/components/settings/HomeBannerPanel.tsx`，3 槽位选图/启用/链接，独立保存）。
- 官网即时搜索聚焦时只显示一层品牌红边框，避免全局焦点环与输入框边框叠加；页脚四个社交图标统一占用 `44×44px` 槽位，链接状态不会改变图标间距。
- 即时搜索在输入变化时立即使旧响应失效，加载期间不允许选择旧建议；错误保持可重试，Escape 只关闭建议框而不清空关键词，关闭后 Enter 提交当前关键词。列表 ARIA ID 按组件实例唯一生成。
- 联系页地图、Cookie 横幅和底部询盘栏在移动端协调显示，不产生横向溢出。产品分类与 FAQ 移动目录提供横滑提示、边缘控制和 sticky 定位；首图预加载、结构匹配骨架、触屏反馈和 `prefers-reduced-motion` 已统一。

## 可靠性、质量与发布

- 生产要求真实 Redis（`REDIS_REQUIRED=true`）；`/readyz` 同时探测 PostgreSQL 和 Redis，任一关键依赖不可用即阻止发布。
- CI 运行后端 Ruff/pytest、前后台 lint/build、SEO 校验、真实 PostgreSQL/Redis 迁移测试、Playwright 关键链路、Lighthouse 阈值与依赖审计。GitHub Actions 已统一使用 node24 运行时的 action 最小必要版本（checkout@v5、setup-node@v5、setup-python@v6、setup-uv@v7、upload-artifact@v6、docker 系列 buildx/login v4 + metadata v6 + build-push v7），仅用于消除 Node 20 弃用告警，job 结构、needs、门禁条件与发布逻辑未变。`frontend` 作业在 Lighthouse 断言之后增加 `Report failing Lighthouse audits` 步骤（`if: always()`，调用 `frontend/scripts/report-lighthouse-failures.mjs`）：`lhci assert` 只报「分类分数不达标」，该步骤把各页 SEO 未通过项及其 `details` 打进日志，用于定位具体失败审计（阈值与预算未调整）。
- 官网与管理后台均为 Next.js **16.3.4**；Playwright 套件在 `frontend/e2e/`（**27 个 spec、119 个用例**，`npx playwright test --list` 口径），管理后台用例也在同一套件内。2026-09-15/16 批次新增带宽转化、列表分页 SEO、新闻媒体性能、新闻预取、新闻产品内链、产品与新闻升级、响应式图片和服务端资源等用例；2026-09-18/21 批次新增 `admin-mobile.spec.ts`（后台移动端：卡片列表、媒体库折叠、表单吸底、矮屏弹窗）与 `home-banner.spec.ts`（首页轮播：轮播切换、首张回退、art direction 换源、后台面板保存）；2026-09-22 批次新增 `admin-album-tree.spec.ts`（媒体库相册的新建定位、改回根级、父级排除自身子孙 + 后端拒绝成环）与 `admin-album-sort.spec.ts`（同级拖动重排持久化、上移/下移与首末置灰、根级与「全部」缩进对齐），并回归 `admin-reliability` / `admin-settings` / `admin-data` / `inquiry-editor` / `content-lifecycle` / `product-news-upgrade` / `public-quality` / `bandwidth-conversion` / `responsive-images` / `list-query-seo`。列表故障与 sitemap 缓存的专项校验由 `frontend/scripts/verify-listing-failures.mjs`、`frontend/scripts/verify-sitemap-cache.mjs` 以独立模拟 API 脚本覆盖，不计入 Playwright 用例、不写入业务库。
- **E2E 交互用例统一等待 React 注水**：`page.goto()` / `page.reload()` 在 window load 就返回，此时 DOM 可读写但事件处理器尚未挂载，直接交互会产生「操作无效、无请求、无报错」的假失败。用例通过 `frontend/e2e/hydration.ts` 的 `gotoHydrated()` 打开页面、`waitForHydration()` 在 `reload()` 后补等待；不使用 `waitUntil: "networkidle"`（开发模式下网络静默早于注水完成）。用例在本地 dev 模式下使用 `localhost` 而非 `127.0.0.1`（Next 开发服务器对 `/_next/*` 的同源校验会对后者返回 403，导致页面不注水）；CI 以生产构建（`next start`）启动服务，不受此限制。`playwright.config.ts` 固定 `workers: 2`，避免本机多 dev server 并存时因机器过载出现 teardown 超时。用例夹具必须在 `finally` 中清理（逐条容错，不因清理失败掩盖原始失败），避免残留内容进入官网或污染下一轮断言。
- **管理后台表单下拉为自绘 listbox（SelectField）**：e2e 断言当前值用触发器的 `data-value`（不是 `toHaveValue`），打开下拉先断言 `aria-expanded="true"`，选项限定在 `getByRole("listbox", { name: "X options" })` 作用域内（触发器用 `getByRole("button", ...)` 定位，`getByLabel` 会因子串匹配误命中 listbox）；交互与滚动行为约定详见 `frontend/AGENTS.md` 的「自绘下拉与 e2e 约定（2026-09-12）」。本地手工跑 e2e 还需环境对齐：三服务同 `JWT_SECRET`、后端配置 `NEXT_REVALIDATE_URL`/`REVALIDATE_SECRET` 并对 localhost 关闭系统代理（`NO_PROXY`），否则会出现与代码无关的假失败。
- **后台产品 SEO 快速编辑的竞态修复（2026-09-21）**：`content-lifecycle.spec.ts` 第 99 行「清空 SEO 描述后行徽标变未设置」的偶发失败，根因既不是后端列表缓存陈旧，也不是断言本身：弹窗初值来自**列表行数据**，而 `handleSeoSave` 保存成功后 `mutate(productsKey)` 未等待，重新校验落地前行数据仍是旧值；在这段窗口内重开同一行弹窗会带入旧 `seo_title`，只改「描述」再保存就把已清空的「标题」写回。trace 证据：`PUT`(清标题) 后列表 `seo_title=""`，下一次 `PUT`(清描述) 后 `seo_title` 变回旧值，失败现场行快照为 `button "已设置"`。修复：`admin-next/src/app/(admin)/products/page.tsx` 的 `handleSeoSave` 在关闭弹窗**之前**把刚保存的值写入行缓存（`mutate(key, updater, { revalidate: false })`），再后台重新校验（读取失败不影响已保存结果），与 `settings/page.tsx` 既有写法同构。同轮还修掉该 spec 两条独立偶发：标题只用 `Date.now()` 时 `workers: 2` 会让两条用例生成同一 slug（命中 `t_product_slug_key` 唯一约束 → 后端未捕获异常 500 `B999001`，`create_product` 的 slug 查重存在 TOCTOU），改为追加随机后缀；`添加` 按钮在页面上有多个（关联产品候选列表每行一个），点击限定到规格行内（`getByPlaceholder("值（如：4800 万像素 CMOS）").locator("..")`）。
- **本地跑 e2e 的实测前置（2026-09-21 补记）**：后端 `app_env` 默认 `production`（`common/config.py`，`backend/.env` 未设 `APP_ENV`）→ 会话 Cookie 带 `Secure`；Playwright 的 `APIRequestContext` **不会在明文 HTTP 上发送 `Secure` Cookie**（浏览器会，因 `localhost` 属可信源）。故本地 e2e 必须用 `E2E_ADMIN_URL`/`E2E_API_URL`/`E2E_FRONTEND_URL` 指向 `http://localhost:...`；用 `127.0.0.1` 会在 `page.request` 的首次调用即 401（现象为 `categories.data` 为 null）。另需在测试进程环境导出与 `admin-next/.env.local` 一致的 `JWT_SECRET`，否则 `admin-settings`/`admin-reliability` 的伪造 Cookie 验签失败、页面被重定向到 `/signin`（表现为「找不到列表行/按钮」）。登录限流 `RATE_LOGIN_PER_MIN=10` 会限制 `--repeat-each`（每个用例登录一次），重复验证需分批并留间隔。
- **仍未处理（2026-09-21 记录）**：`admin-next` 以 `next start` 运行时打印 `"next start" does not work with "output: standalone" configuration`，且偶发 `Failed to proxy http://127.0.0.1:8000/... Error: read ECONNRESET`（前端收到 500 `Internal Server Error` 纯文本、非后端信封，后端日志无 traceback）。该现象会让任意经 `:3001` 代理的请求偶发失败（本轮 22 次 products 复跑中命中 1 次），与业务代码无关；彻底规避需按 `next.config.ts` 的意图改用 `node .next/standalone/server.js` 启动后台。
- **媒体库相册创建/编辑链路（2026-09-22）**：点「+」新建时父级默认取**当前正在浏览的相册**（「全部」/「未分类」不是具体相册 → 根级），创建成功后**自动选中新相册并展开它的全部祖先**（此前新相册藏在折叠的父节点里，看起来像「没建成」）；父级下拉改按**层级路径**展示（`Products / dc226`）并在编辑时排除自身与全部子孙，同级重名给**行内提示但不阻断**（同名相册是合理场景，如两次导入同一产品），别名输入框按 `_slugify` 同规则提示「留空则自动生成：xxx」/「实际保存为：xxx」并对非法字符就地报错。后端配套（`uploads/services.py`、`uploads/routers.py`）：`PUT /admin/albums/{id}` 的 `parent_id` 现在区分**不传**（保持原父级）/ `null`（移到根级）/ `id`（换父级）三种语义——此前统一按「参数为 `None` 即不修改」判断，导致选「无（根级）」被静默忽略、相册永远回不到根级（`services.update_album` 用模块级 `UNSET` 哨兵 + 路由按 `model_fields_set` 只透传客户端真正提交的字段）；换父级前上溯校验**不能移到自己或自己的子孙下**（成环会让 `buildTree` 从根遍历不到该子树，整棵子树从侧边栏消失），用 `seen` 集合 + 100 步上限收敛以兼容历史脏数据；更新别名补格式与唯一性校验，撞车返回 `C400001` 友好提示（此前直接落库撞 `slug` 唯一约束 → 未捕获异常 500 `B999001`），并兜 `IntegrityError` 覆盖并发写入；创建路径对显式别名同样要求可归一化（中文别名不再落库成不可读 slug，未指定时仍回退 `album-{6位随机}`）。前端 `AlbumNode` 新增**可选** `openIds`/`onToggleOpen` 受控展开（不传则回退内部 state，`MediaPicker` 的 DOM 与行为不变）、`aria-current`（标记当前相册）与展开开关的 `aria-label`/`aria-expanded`。回归：`backend/tests/test_media_albums.py` 增加 6 项（显式 null 移回根级且「不传 / 空 body」不改动任何字段、`name`/`sort_order` 显式 null 语义为忽略、自身/子孙作父级被拒且库中层级不变、slug 冲突友好报错且原值不变、非法别名被拒 + 纯中文名回退随机别名、别名大小写与分隔符归一化、库中已有历史环时上溯收敛并放行不含自身的链），后端 `pytest tests -q` **166 项通过**；e2e 全通过 `admin-album-tree`（3 项）、`admin-mobile`、`media-library-video`、`product-news-upgrade`、`content-lifecycle`。已知限制：换父级的校验与写入不在同一事务（无行锁），两个并发 PUT 互设父级理论上仍可形成环——前端已从 UI 阻断该路径，且成环后 `buildTree` 只是不显示该子树、`rollup_album_totals`/子树筛选/`descendantIds` 均有收敛防御，不会 500 或死循环。
- **媒体库相册排序可预期 + 同级拖动排序（2026-09-22 第二批）**：「排序填 0 反而排最后」的成因有二：`sort_order` 默认值就是 0（自动归档生成的 135 个子相册写死 `0.0`，全部并列），且**次级排序口径不一致**——后端 `list_albums` 用 `sort_order, -created_time`（新的在前）、前端 `buildTree` 用 `sort_order asc || id asc`（新的在后）且前端覆盖后端。现在统一为 `sort_order asc, id asc`；`create_album` 缺省排序改为**同级最前**（`min(同级)-1`，可为负，同级为空为 0；`auto_categorize_uploads` / `_resolve_categorize_hint` 仍写死 0.0/1.0/2.0、不受影响）；`update_album` 换父级时若未显式传 `sort_order`，排序值也重算为新同级最前（避免沿用旧父级数值让位置不可预期）。新增 `PUT /admin/albums/sort`（body `{ parent_id, ids }`，**数组下标即 sort_order**，包在 `in_transaction()` 内；校验非空 / 无重复 / 全部存在 / 同级一致，否则 `C400001`；路由**必须声明在 `/admin/albums/{album_id}` 之前**），未列出的同级保持原值（与前端的「无过滤下拉一律全量」配合）；显式 `sort_order` 补 **F-18 口径**校验（`math.isfinite` + `±1_000_000`，含裸 `NaN`——落库后前端相减得 NaN 会让排序彻底错乱）。前端：相册弹窗**移除「排序」数字输入**（后端参数保留，老数据继续生效）；`AlbumNode` 新增**全部可选** props `index` / `siblingCount` / `sortable`（不传时行为与 DOM 与旧版一致；`MediaPicker` 只传 album/selectedAlbumId/onSelect → 不渲染拖拽与上下移），桌面端可在**同一父相册内拖动**重排（跨父级拖动忽略，改父级仍走编辑弹窗；松手即保存：先乐观 `mutate(albumsKey, updater, {revalidate:false})` 把同级 `sort_order` 就地写成 `0..n-1`，再 `PUT /admin/albums/sort`，失败 toast 并回滚到服务端顺序），触摸端用「上移 / 下移」按钮（首项上移、末项下移置灰；HTML5 拖拽在触摸屏不触发），面板底部加一行提示（桌面「拖动相册可调整同级顺序」/ 触摸端「用 ↑ ↓ 按钮调整同级顺序」）。操作按钮（上移/下移/编辑/删除）在行内**右侧独占一列**（flex 分栏：桌面 hover 才占位、不悬停时名字完整，触摸端常显），不再使用绝对定位浮层——浮层在 224px 桌面侧栏里会盖住相册名后半段（只剩「dc」可见），并因此去掉了给浮层让位用的计数徽标 `max-md:mr-16 / max-md:mr-32` 补丁。随后（同轮第三批）按用户选择把**相册侧栏由 224px 加宽**——`md:w-64 lg:w-72`（768–1023px 用 256px，≥1024px 用 288px；这段窄屏主内容区本来就小，避免把图片网格压得太狠）——并在**桌面端悬停该行时隐藏行尾计数**（把约 20px 让给相册名），相册名再加原生 `title` 兜底看全名。效果：悬停行的名字可用宽度约 6 字 → 约 14 字，不悬停约 17 字 → 约 26 字（超长名字仍截断但有 tooltip）。计数提示（`含子相册共 N 个素材（直系 M 个）`）从计数徽标**移到主按钮的 `title`**：徽标在桌面悬停时会被隐藏，提示挂在它身上等于「想悬停看数字时它反而消失」。护栏：遮挡几何用例覆盖 **1280 / 1024 / 900 / 768 / 390** 五个视口，每个视口都断言 `scrollWidth - innerWidth ≤ 1`，桌面视口另断言「悬停时计数隐藏且上移按钮可见」（两条 `md:group-hover:*` 规则必须同步生效）。另修**缩进错觉**：根级相册与「全部 / 未分类」文字左缘此前差 18px（节点行固定占展开箭头槽、虚拟行没有，看起来「没有父相册却低了一级」），现共用 `types.ts` 的 `ALBUM_ROW_PAD` / `ALBUM_ARROW_SLOT` / `ALBUM_ICON_CLASS` / `ALBUM_ROW_GAP_CLASS` / `ALBUM_INDENT` 行模板（有/无子相册的箭头槽都固定 18px，依赖 Tailwind preflight 的 border-box），子级每层 +16px。回归：`backend/tests/test_media_albums.py` 增加 7 项（同级重排写 0..n-1 含根级与子级、跨父级/不存在/重复/空 ids 被拒且不写库、缺省同级最前且显式值仍生效、子集重排语义、`sort_order` 范围与裸 NaN 校验、换父级重算排序），后端 `pytest tests -q` **173 项通过**；新增 `frontend/e2e/admin-album-sort.spec.ts`（拖动同级重排持久化 + 刷新保持、上移/下移与首末置灰、根级与「全部」文字左缘差 ≤1px 且子级 +16px、弹窗无 spinbutton），并回归 `admin-album-tree` / `admin-mobile`（390px 无横向溢出、矮屏弹窗）/ `media-library-video`（MediaPicker 无拖拽与上下移）/ `product-news-upgrade` / `content-lifecycle` 全通过。已知限制：`reorder_albums` 的校验在事务外（单管理员后台，风险可忽略）；连续快速拖动未做串行化。
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
8. 后端已对公开媒体输出 `Cache-Control: public, max-age=3600`；若 OpenResty 直接服务 `uploads` 或覆盖响应头，需在反代层对齐同一策略。frontend 发布使用命名卷 `frontend_image_cache`，替换图片优先使用新 URL，避免旧衍生图在浏览器缓存窗口内继续命中。
9. 首页资源审计报告（`reports/home-resource-audit-2026-09-16.md`）测量的是发布中的旧版本；字体、社交图、卡片预取等减负改动尚未上线，发布后需在相同条件下复测再评估是否继续裁减客户端动画。

## 仍属于后续工作的事项

对象存储/CDN、多机横向扩容、数据库迁移自动回退、销售转化分析和更细粒度 RBAC 尚未实现；实施前需单独评估并更新本文档。
