# Songdian B2B — 管理后台（Next.js 16）

> AGENTS.md — 新会话快速上手指南。聚焦「启动命令 + 结构 + 雷区踩坑 + 常用修改路径」。
> 本子项目**雷区极多**，新会话极易踩坑导致全站 500 / 无样式 / 永远登录失败，请务必先读「雷区」节。

> 2026-08-19 更新：产品/新闻表单共享 `src/components/content/ContentWorkflowPanel.tsx`，支持状态、定时发布、版本恢复和短期预览。媒体 URL 必须经 `resolveMediaUrl()`；相对 `/uploads/...` 保持同源并由 rewrite 转发，禁止在组件中硬编码后端主机。

> 2026-09-11 更新：Next.js 升至 **16.3.4**。`src/app/layout.tsx` 的 `<html>` 已加 `suppressHydrationWarning`（原因见雷区 ⑨）。后台相关 E2E 用例位于 `../frontend/e2e/`，不在本目录（见雷区 ⑩）。

> 2026-09-16 更新：产品编辑页新增**商品详情图**编辑器 `src/components/form/ProductDetailImageEditor.tsx`（多图上传、说明、排序、移除，写回产品 `content_html`），约定见下方「商品详情图约定（2026-09-16）」。本轮后台无数据库结构改动。

---

## 项目定位

松典科技 B2B 官网的**管理后台**，端口 `3001`，服务 `../backend/` 的 `/api/v1/admin/*`。

生产环境后台必须使用已备案域名和 HTTPS；Secure HttpOnly 会话 Cookie 不支持 IP/HTTP 登录。
Docker 内 API 代理使用
`BACKEND_PROXY_URL=http://backend:8000`，不要改成公网 IP。
Next.js 16（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui 风格组件。
`proxy.ts` 做前端路由守卫（校验后端下发的 HttpOnly `access_token` Cookie），`access_token` 失效时用 `refresh_token` 调后端 `/api/v1/admin/refresh` 静默续期并放行原目标页面，接口层另有 RBAC 兜底。

---

## 本地启动

```bash
# ⚠️ 必须用 Node 24.18.0（系统默认路径）
"/c/Program Files/nodejs/node.exe" node_modules/next/dist/bin/next dev -p 3001
```

> ⚠️ 不能用 `npm run dev` 或 `node_modules/.bin/next`：本机沙箱 fork 易失败（EAGAIN），且 bin wrapper 在部分环境下不工作；**直调 `node_modules/next/dist/bin/next` 最稳**。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 + React 19 + TypeScript（strict） |
| 样式 | Tailwind CSS v4 + `@tailwindcss/postcss` + `@tailwindcss/forms` |
| UI | 内置 `components/ui/`（shadcn 风格）+ lucide-react 图标 |
| 图表 | apexcharts / react-apexcharts、@fullcalendar/* |
| 交互 | react-dnd（拖拽排序）、flatpickr（日期）、@react-jvectormap（地图） |
| 数据获取 | SWR (v2) + 全局 `SWRProvider`（封装 `apiFetch`，详见 `lib/api-client.ts`） |
| 安全清洗 | `sanitize-html` ^2.17.7（与 `frontend` 同版本，仅新闻正文预览用；类型 `@types/sanitize-html` 在 devDependencies） |
| 守卫 | `proxy.ts`（Edge Runtime，校验后端下发的 HttpOnly `access_token` Cookie；失效时用 refresh Cookie 静默续期） |

---

## 目录结构（`src/`）

```
admin-next/src/
├── app/                 # 路由（(admin) 布局分组 + (full-width-pages)）
│   ├── (admin)/         # 受守卫页面：dashboard/products/categories/news/inquiries/media/users/settings/audit-logs/*-form
│   ├── (full-width-pages)/  # 登录等全宽页：signin / signup
│   ├── layout.tsx / globals.css / not-found.tsx
├── components/          # auth/calendar/charts/common/ecommerce/example/form/header/tables/ui/user-profile/videos
├── context/             # 全局状态：SidebarContext / ThemeContext / SWRProvider
├── hooks/               # 自定义 hooks
├── icons/               # ⚠️ SVG 图标用 generated.tsx（内联 React 组件），不要走 @svgr/webpack
├── layout/              # 侧边栏 / 顶部栏布局
├── lib/                 # API 客户端等工具
└── proxy.ts        # 路由守卫（见雷区 ④）
```

---

## 路由总览

| 路由 | 说明 |
|------|------|
| `/` | Dashboard |
| `/products` `/categories` | 产品列表（拖拽排序 + SEO 快速编辑）/ 分类管理 |
| `/news` `/inquiries` `/media` | 新闻列表（拖拽排序）/ 询盘 CRM（分配/标签/跟进时间线）/ 媒体管理 |
| `/product-form` `/news-form` | 产品 / 新闻编辑表单（含 SEO 元数据面板） |
| `/signin` `/signup` | 认证（公开） |

---

## ⚠️ 雷区（新会话必读，踩中即崩）

1. **Node 必须 24.18.0**：Node 22 与 Next 16 Turbopack 的 `next/image` Web Streams 不兼容，启动即报错。
2. **严禁 `@svgr/webpack`**：本机 Turbopack 的 webpack-loader worker 子进程**启动即崩（exit 1）**，会拖垮所有页面 500。SVG 图标一律用 `src/icons/generated.tsx` 里的内联 React 组件，不要 `import Icon from './x.svg'`。
3. **必须保留 `postcss.config.mjs`**（`@tailwindcss/postcss`）：这是唯一正确的 Tailwind v4 管线。删除它 → Next 16 退化为原生 Tailwind，在本机多 lockfile 仓库里会误判 workspace 根、漏扫 `.tsx` 里的布局类 → 整页「没有样式」（HTTP 仍 200，肉眼像裸 HTML）。
4. **`proxy.ts` 的 matcher 必须排除 `/api` 与 `/uploads`**：当前为 `["/((?!_next/static|_next/image|favicon.ico|api/|uploads/).*)"]`。若写成 `["/((?!_next/static|_next/image|favicon.ico).*)"]` 会把登录接口 `/api/v1/admin/login` 也当未登录页重定向到 /signin → 浏览器端永远登录失败。
5. **客户端组件必须显式 `"use client"`**：含 `useState/useRef/useEffect` 的组件忘了加 → 报 500「importing a module that depends on useState into a RSC module」。
6. **中文注释不能写进 JSDoc `/** */`**：Rust 写的 `next-code-frame` 按 byte 索引定位 JSDoc 字符串，遇 UTF-8 多字节字符会 panic（`end byte index X is not a char boundary`）。统一用 `//` 行注释写中文。
7. **React 19 禁止 useEffect 同步 setState**：lint 规则 `react-hooks/set-state-in-effect`。prop 变化时重置子组件 state 用 `key={prop}` 强制重挂载，而非 useEffect+setState。
8. **`.next/dev` 缓存写冲突（Turbopack 整组 500）**：浏览器报 `An unexpected Turbopack error`、dev 日志出现 `Persisting failed: Another write batch or compaction is already active` / `拒绝访问 (os error 5)`，是**两个 next dev 进程抢写同一 `.next/dev` 缓存**所致，整个 `(admin)` 路由组页面一起 500（仅 `/signin` 因重定向才返回 307）。修法三板斧：① `netstat -ano | grep ":3001 "` 拿 PID → `taskkill /F /PID <pid>` 杀冲突进程（**注意别误杀 :3000 的 frontend**）；② `rm -rf .next/dev` 清空缓存；③ 单进程重起（Node 24 直调 next bin）。
9. **`<html>` 上的 `suppressHydrationWarning` 不要删**（`src/app/layout.tsx`）：浏览器扩展会在 React 加载前给 `<html>` 写入 `data-theme`、行内 `style` 等属性，导致 React 报「服务端渲染与客户端属性不一致」的 hydration mismatch 告警。该 prop 只抑制 `<html>` **自身属性**的告警，不会掩盖子树的真实 mismatch。排查此类报错时先全仓库搜那串值（往往代码里根本没有），再用干净浏览器对比；官网 `frontend/app/layout.tsx` 早已有同一属性，属项目内一致约定。
10. **管理后台的 E2E 用例不在本目录**：全部在 `../frontend/e2e/`（同一个 Playwright 套件，如 `admin-reliability`、`admin-settings`、`admin-data`）。跑法、地址约定与「必须等待 React 注水」的要求见 `../frontend/AGENTS.md` 的「E2E 测试（Playwright）」章节 —— 后台页面同样是客户端渲染，交互前不等注水会静默失败。

---

## 常用修改路径

| 需求 | 操作 |
|------|------|
| 改产品/新闻表单 | `app/(admin)/product-form` / `news-form` + `components/form/*` |
| 改列表/拖拽排序 | `app/(admin)/products` / `news` + `components/ecommerce` / `react-dnd` |
| 改侧边栏/顶部栏 | `components/layout/*` + `context/` |
| 改 API 调用 | `lib/`（封装 fetch 到 `/api/v1/admin/*`） |
| 改数据获取/SWR | `lib/api-client.ts`（`swrFetcher`/`apiFetch`）+ 各 list 页 `useSWR` |
| 加图标 | 在 `icons/generated.tsx` 加内联 SVG 组件（**勿用 @svgr/webpack**） |
| 改路由守卫 | `proxy.ts`（注意 matcher 排除项，见雷区 ④） |
| 改配色/主题 | `app/globals.css` + `tailwind` 配置 |

---

## 路由守卫安全（2026-07-28 修复）

`proxy.ts` 现使用 `jose` 校验 `access_token` 的 HS256 **签名**（不再仅 base64 解码 `exp`）。
要求：

- `admin-next` 必须在**运行期**配置与后端一致的 `JWT_SECRET`；禁止以 Docker build arg 注入；
- 未配置 `JWT_SECRET` 时降级为仅校验 `exp` 并告警（仅本地开发，不安全）；
- 仍需保持 matcher 排除 `/api` 与 `/uploads`（见雷区 ④），否则登录被拦截。

当前 JWT 签名校验以 `src/proxy.ts` 和后端 JWT 配置为准。

## 审计修复（2026-07-31）

P0 级审计修复（相关行为已合入当前代码）：
- **询盘 CRM**：`inquiries/page.tsx` 全面重写——表格新增「负责人」列（点击弹出分配面板）、「标签」列（逗号编辑）、状态五态管线流转按钮、展开行显示跟进时间线。新增分配弹窗和标签编辑弹窗。后端新增 `PUT .../assign` + `POST .../follow-note` 端点。
- **产品 SEO 管理**：`product-form/page.tsx` 新增「SEO 元数据」面板（seo_title / seo_description 输入框 + 字数计数器）；`products/page.tsx` 表格新增「SEO」列（已设置=绿色 / 未设置=灰色，点击弹出快速编辑弹窗）。
- **产品批量操作**：`products/page.tsx` 新增全选/单选 Checkbox + 批量操作栏（发布选中/隐藏选中/删除选中），`Promise.all` 并发逐条 PUT/DELETE。
- **用户管理**：`users/page.tsx` 新增用户管理页——表格列出所有后台账号 + 新建弹窗（username/password）+ 删除（admin 不可删）+ 密码重置弹窗。所有新账号统一管理员权限。

## 首页轮播后台配置（2026-09-21）

- 设置页新增「首页轮播」面板（`components/settings/HomeBannerPanel.tsx`），管理公开设置键 `home_banners`：固定 3 个槽位，每槽 = 图片（`MediaPicker` 单选）+ 可选**移动端专用竖版图** + 启用开关 + 跳转链接（支持站内 `/path` 或 http(s)）。
- 第 1 槽是**首屏主图**：留空即官网默认 Banner（保持原有悬浮文字与按钮），因此该槽没有启用开关、链接输入禁用；第 2、3 槽是纯图轮播，启用开关只在选了图后可用。
- 面板**独立保存**（PUT `/admin/settings` 只提交 `home_banners`），与页面通用差量保存互不干扰：该键已从 `otherEntries` 排除，不得混进 `editValues`/`changes`。
- 面板以 `key={服务端值}` 挂载 —— 服务端值变化（保存/他处修改）时整体重置；值不变（SWR 后台 revalidate 返回同值）不会丢失未保存编辑。
- ⚠️ 与 SMTP 键同理：`home_banners` 行由后端 `ensure_admin_settings()` 惰性创建，前端不要手动建 key；`PUT` 只更新已存在的行。
- 产图标准（面板内折叠说明）：桌面 1920×1080（16:9）≤500KB、手机竖版 1080×1350 或 1080×1920 ≤350KB；主体居中、四周留 ≥10% 安全边距；第 1 张左侧 60% 不放关键主体（叠加文字所在）。
- 回归用例：`../frontend/e2e/home-banner.spec.ts`（4 条：官网轮播/首张回退/art direction 换源/面板保存），需三服务在跑并注入 `E2E_ADMIN_URL`。

## 邮件通知 SMTP 后台配置（2026-08-01）

- `settings/page.tsx` 新增「邮件通知（询盘 SMTP）」分组：识别 `smtp_*` / `inquiry_email_*` 键归组展示（两列栅格），右上角「测试发送」按钮（先 PUT 保存当前表单 → POST `/admin/settings/smtp/test` 用已存配置发信）。
- `smtp_password` 后端脱敏：GET 返回 `******`，PUT 回传掩码时后端保留原值（前端无需特殊处理）。
- ⚠️ SMTP 配置 key 由后端惰性创建（`GET /admin/settings` 触发），前端**不要**在页面里手动建 key；页面只依赖后端返回的 key 渲染。
- **仪表盘增强**：`EcommerceMetrics.tsx` 新增询盘国家分布（按 country 字段 Top 10）和询盘状态分布进度条。后端 `GET /admin/stats`。
- **审计日志**：`audit-logs/page.tsx` 新增审计日志表格页——时间/用户/操作/资源/结果/IP，分页+搜索。侧边栏新增入口。搜索词现已提交后端（`keyword`），在分页前过滤并返回过滤后 `total`，不得退回“只过滤当前页”。
- **动态头部**：`UserDropdown.tsx` 改为从 `/admin/profile` 动态读取用户名，显示真实 username + 首字母头像（不再硬编码"管理员"/"A"）。
- **询盘国家标记**：`inquiries/page.tsx` 跟进对话框新增 Country 输入框，保存时写入数据库（纯后台标记，客户表单不需要国家字段）。

## 官网社交 metadata 联动（2026-08-27）

- 产品主图和新闻封面会成为公开详情页的 Open Graph/Twitter 图片；媒体选择器和表单不得无提示地丢失已有封面 URL。
- 无封面时由官网回退到默认 1200×630 品牌图，管理后台不需要生成占位记录或写入默认图 URL。
- 保存封面、SEO 标题/描述、新闻标题/摘要后，后端负责缓存失效与官网 ISR revalidation；后台不要直接调用公开页面或拼接社交 metadata。
- `/llms.txt` 是 frontend 的实验性站点导览，不属于管理 API，不在后台新增一个重复编辑入口；公司核心事实继续由官网共享内容配置维护。

## 会话、表单与列表约定（2026-09-12）

- **入口静默续期**：`src/proxy.ts` 在 `access_token` 失效时用 `refresh_token` 调后端 `/api/v1/admin/refresh`，把 `Set-Cookie` 写回响应并放行到原目标页面；refresh 为单次使用，必须保留并发去重（同一 refresh 共享同一次刷新结果）。只有 refresh 真正失效/后端不可达才跳 `/signin?expired=1`。禁止改成“缺少 access 即重定向登录页”。
- **登录表单保持 `method="post"`**：`components/auth/SignInForm.tsx` 依赖原生 POST 兜底，避免脚本未接管时把凭据写进 URL 查询串。
- **封面上传阻塞保存**：产品/新闻表单的封面/图库/详情图/正文插图统一走 `components/media/MediaPicker`（从媒体库选择；选择器内也可上传，默认带 `categorize=product|news:{slug}` 自动归档）。选择器通过 `onBusyChange` 驱动 `coverUploading`/`uploading`/`detailUploading`/`contentUploading`，上传期间禁用保存与字段。
- **媒体库支持视频**：后端白名单为图片（jpg/png/webp/gif ≤ `MAX_UPLOAD_MB`）+ 视频（mp4/webm ≤ `MAX_UPLOAD_VIDEO_MB`，默认 50）；类型判定按扩展名（与 `_build_upload_filter` 一致），不做转码，首帧/时长由浏览器读取；正文/产品详情暂不支持嵌入视频（HTML 白名单未放开）。
- **分类删除先迁移**：分类下仍有内容时 `DELETE` 返回 `C400001` 与关联数量；`categories/page.tsx` 提供「迁移并删除」（`POST /admin/categories/{id}/migrate-and-delete`）。新闻分类迁移接口为 `POST /admin/news-categories/{id}/migrate-and-delete`，后台暂无独立管理页。
- **相册计数用 `total_count`**：媒体库侧边栏展示含全部子相册的合计；按相册筛选记录时后端已包含子相册，显示数量与列表条数必须一致。`count` 仅供需要“直系数”的场景使用。
- **列表分页**：审计日志按 `keyword` 走服务端过滤并回到第一页；媒体库与列表页的筛选条件变化时同样重置页码。
- **表单下拉统一用 `SelectField`**（`components/form/SelectField.tsx`，自绘 listbox，对外 props 兼容原生 select：`value` / `onChange` / `<option>` 子节点）。滚动行为三原则：**选项列表内部滚动不关闭菜单**（点选靠下选项时的列表滚动不得关闭）、页面等外部滚动按触发器新位置**重定位**（位置未变不重渲染）、仅当触发器完全离开视口才**关闭**。当前值暴露在触发器 `data-value`，不是 `input.value`。修改滚动/定位行为必须同步跑 `frontend/e2e/content-lifecycle.spec.ts`——曾因「点选项前的列表滚动被当成页面滚动关闭菜单」导致 CI 里选项 detached 超时。

## 商品详情图约定（2026-09-16）

- 编辑器是 `src/components/form/ProductDetailImageEditor.tsx`，挂载在产品编辑页 `src/app/(admin)/(others-pages)/product-form/page.tsx`。它用 `DOMParser` 把 `content_html` 中的 `img` 摘出为可编辑列表，编辑完成后按同结构序列化回 HTML；**文字内容必须原样保留**，不要因为只处理图片而重建整个 HTML。
- 上传流程：先用 `createImageBitmap()` 读取原始宽高，再调用现有上传函数，把 src/alt/width/height 一起写回。宽高用于官网预留正确比例，缺失时官网会退化为原生 `<img>`。
- 交互细节（2026-09-17 补齐，改动后必须同步跑 `frontend/e2e/product-news-upgrade.spec.ts`）：区块带 `role="group" aria-label="商品详情图"`（e2e 定位锚点，不要删）；无图时显示空态引导；支持**拖拽上传**（容器 `onDrop` 复用同一个 `add()` 入口）；**逐张进度**文案是 `正在上传第 x/y 张…`（`apiFetch` 基于 fetch 拿不到上传百分比，这里刻意不做假进度）；**移除需二次确认**（复用 `ConfirmDialog`，`confirmText="移除"`）。
- **未保存离开提醒**：编辑器通过 `onDirtyChange` 上报「自上次保存后被改动」，产品表单据此（a）注册 `beforeunload`，（b）点「取消」时先弹 `ConfirmDialog`。保存成功后表单必须复位 dirty，否则正常跳转会误弹。
- **新闻正文编辑器（2026-09-22 改写，勿按旧文档理解）**：`RichTextEditor` 已是**纯 HTML 代码编辑器** —— 只有一个等宽 textarea（`aria-label="HTML 源码"` 是 e2e 锚点），可视化模式、`contentEditable`、`document.execCommand`、`upload` prop 均已删除（不要再把正文交给 `innerHTML`/`dangerouslySetInnerHTML` 渲染）。插图走「从媒体库插入图片」（`title` 是 e2e 锚点）→ 选择器确认后按 `measureImage` 读原始宽高，在**代码光标处**插入 `<img src alt width height>`；上传期间 `onBusyChange(true)` 让父表单禁用保存，保存按钮文案变「正文图片上传中...」。右侧预览是 `ArticlePreviewFrame`：先按 `lib/article-html.ts`（后端 bleach ∩ 官网 sanitize-html 白名单的交集）清洗，再渲染进 **`<iframe sandbox="">`（无 allow-scripts / allow-same-origin）+ 内嵌 CSP**，这是强制安全边界，清洗层只负责保真。
- 忙碌态：上传期间通过 `onBusyChange(true)` 触发父表单的 `detailUploading`，保存按钮与表单字段必须禁用，避免半成品被保存。
- 交互：每张图可编辑说明（写入 `alt`）、上移/下移调整顺序（首尾按钮禁用）、逐张移除；封面与图库仍为独立字段，图库/规格的增删仍是立即保存。
- 详情图保存在产品正文，复用既有上传媒体、版本历史与发布缓存刷新链路；产品私密预览使用同一渲染规则。e2e 回归见 `frontend/e2e/product-news-upgrade.spec.ts`。

## 媒体库相册交互与排序（2026-09-22）

- **新建默认跟随当前相册**：点「+」时父级默认取**当前正在浏览的相册**（`selectedAlbumId > 0`）；「全部」（`null`）与「未分类」（`0`）不是具体相册 → 根级。仍可在下拉里改。
- **建完就地定位**：创建成功后 `selectAlbum(新 id)` + 用 `albumChainIds()` 展开其**全部祖先**（此前新相册藏在折叠的父节点里，看起来像「没建成」）。
- **父级下拉按层级路径展示**：选项文案用 `albumPath()`（`Products / dc226`）而非裸 name；编辑时用 `descendantIds()`（含自身）过滤掉自身与全部子孙，并在下方提示「已隐藏该相册自身及其 N 个子相册（挂上去会形成循环）」。挂到自己子孙下会成环、整棵子树会从侧边栏消失——后端也拒绝（`C400001`）。
- **同级重名只提示不阻断**（`duplicateAlbum`）：文案「同级已有同名相册「x」，仍可创建，但建议改名以便区分。」同名相册是合理场景（如两次导入同一产品），不要改成硬拦截。
- **别名提示按 `slugifyAlbumName()`（与后端 `_slugify` 同规则）**：非法 →「别名只能包含英文字母、数字，请修改或留空（中文会被自动去掉）。」；已填 →「实际保存为：xxx」；留空 →「留空则自动生成：xxx」，纯中文名则提示「留空则由系统按名称生成（纯中文名会生成随机别名）。」
- **排序数字输入已移除**：相册弹窗只剩名称 / 别名 / 父级三项（`albumForm` 不再有 `sort_order`），后端参数保留、老数据继续生效。排序改由**同级拖动**（仅同一父相册内，跨父级拖动直接忽略——改父级仍走编辑弹窗）与**上移/下移**完成，落库走 `PUT /admin/albums/sort`（**数组下标即 `sort_order`**）。上移/下移按钮 `aria-label` 为 `上移 {name}` / `下移 {name}`，首/末项分别置灰。
- **排序的乐观更新**：拖动或上下移先 `mutate(albumsKey, ..., { revalidate: false })` 就地改顺序，再发请求；失败 `toast.error`；**无论成败都 `await mutate(albumsKey)` 以服务端为准重拉**（失败即回滚），不要让本地顺序与服务端分叉。
- **`AlbumNode` 的扩展 props 全部可选**（不传时行为与渲染出的 DOM 与旧版一致；`MediaPicker` 只传 `album/selectedAlbumId/onSelect`，因此不渲染拖拽与上下移——改这几个 props 必须复核媒体选择器）：`openIds`/`onToggleOpen`（受控展开，**只有两者都传**才受控，只传 `openIds` 会回退内部 state，避免「点了没反应」）、`index`（默认 0）、`siblingCount`（默认 1）、`sortable`（`AlbumSortable`：`busy`/`draggingId`/`overId`/`onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`/`onMove`）；`onEdit`/`onDelete` 同样是可选、不传即不渲染操作条。
- **行模板常量必须共用**：`ALBUM_ROW_PAD`(12) / `ALBUM_INDENT`(16) / `ALBUM_ARROW_SLOT`(18) / `ALBUM_ICON_CLASS` / `ALBUM_ROW_GAP_CLASS`。节点行固定占「展开箭头槽」，而「全部 / 未分类」两个虚拟行没有箭头——历史问题正是根级相册比「全部」右移一级、看起来像「没有父相册却低了一级」；`admin-album-sort.spec.ts` 断言根级与「全部」的 x 差 ≤1、子级缩进 16px。
- **e2e 保留的可访问名（契约）**：`新建相册`（按钮 **`title` 与 `aria-label` 都要有**，用例用 `getByTitle` 定位）、`父级相册`（断言触发器的 `data-value`）、`编辑相册 {name}` / `删除相册 {name}` / `上移 {name}` / `下移 {name}`、展开开关 `展开|折叠 {name}`、选中态 `aria-current="true"`。回归：`frontend/e2e/admin-album-tree.spec.ts`（3 项）与 `frontend/e2e/admin-album-sort.spec.ts`（4 项）。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
