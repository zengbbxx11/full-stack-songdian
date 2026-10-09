# SONGDIAN GSC 技术 SEO 专项排查报告

日期：2026-10-09（Asia/Shanghai）。已完成本地代码修复与非破坏性生产 HTTP 检查；生产部署需人工执行，未更改生产数据或真实环境文件。

## 结论

当前 www 正式站未复现 GSC 历史 Sitemap 无法抓取、全站禁止索引或详情 canonical 不一致。现有 Sitemap 返回 HTTP 200、application/xml，含 64 个唯一 URL（静态 8、产品分类 6、产品 42、新闻 8）。全部 URL 逐一 GET 为 200，自身 canonical 正确，未发现意外 noindex，公开 API 数量与详情条目一致。证据见 production-http.json 与 sitemap.xml；这些数字是当次数据，不是永久断言。

已确认的代码缺口及修复：

- 正式镜像 CI 的 SEO_INDEXABLE 原先缺省 false；服务器 true 不能替代静态 Metadata 构建配置。改为显式 true 的正式镜像构建守卫。尚未取得仓库 Variables 或正在运行镜像，所以不能认定生产曾因该缺口构建错误。
- Sitemap 原先只比较累计条数与最后 total，缺失 list/total 可以当作零条成功，重复页也可能通过，循环缺少边界。新增严格分页、发布/URL/分类/日期校验，限定页数和总时间，不完整或错误响应继续失败而非返回残缺 200。
- 生产不存在的详情返回流式 200 + noindex，但继承首页 canonical 和 index/googlebot:index，指令混杂。根 404 导出明确 noindex、清除 canonical；产品 Metadata 提前 notFound。隔离实例验证普通未知路径 404、产品/新闻仍为原有流式 200，所有错误页无 canonical 且 Googlebot/robots 都 noindex。未改错误页 JSX/加载交互。
- 现有部署冒烟只验证通用服务和搜索，不能发现 SEO 配置错误。新增无第三方依赖 Python 检查，接入内部/API完整性与公开 HTTPS 双入口及 CI。
- 根域 HTTPS 在本检查入口证书名称校验失败；仅加 -k 诊断得到 301 到 https://www.zsaki.icu//。根域 HTTP 先跳根域 HTTPS。重定向目标多余斜杠已由响应确认，TLS/SNI 根本配置需在服务器及其他网络入口验证并人工修复；本次未改 OpenResty。

既有正确行为保留：产品旧扁平 URL 与错误分类单次 308 到有效嵌套地址；分类/有效分页自身 canonical；越界分页 noindex；无效分类回落列表 canonical；搜索与签名预览 noindex；管理员独立索引保护；Sitemap 60 秒完整快照缓存及发布/撤回主动失效。

## 验证

- 生产 HTTP：64 个 Sitemap 页面全部通过；Robots、XML、API 对齐；额外检查旧 URL、入口、无效路径、分页、搜索、预览及 Googlebot UA。
- 新 SEO 公网脚本：真实域名/API，PASS，64 个 Sitemap URL、7 个公开页面、搜索/预览 noindex。
- Node 生产配置守卫：2 项 PASS。
- Python 冒烟回归：7 项 PASS，覆盖全站 Disallow、静态 noindex、Googlebot 前缀 HTTP noindex、XML/重复/域名、canonical、搜索、分页缺失。
- Playwright 分页与现有自动 SEO：11 项 PASS；新增错误页请求回归：1 项 PASS。均为只读或纯函数测试，没有写业务数据库。
- Sitemap 缓存集成：PASS（热缓存无 API 请求、发布失效、异常分页、HTTP 503、非法 JSON/结构/slug/分类/重复条目/total、错误不缓存与恢复）。
- TypeScript noEmit、改动源码 ESLint、既有 verify:seo：PASS。
- 隔离 Next 16.3.4 standalone 生产构建：PASS，使用 webpack、模拟 API、正式 origin 与 SEO_INDEXABLE=true；未覆盖工作目录 .next 或 .env.local。Docker 使用默认构建引擎，此处未运行 Docker/同款 Turbopack 镜像构建。
- 首个响应分片：/products 和 /news 的 title、description、canonical 均在首片 head 内。
- 现有 Lighthouse 四页全部断言 PASS，SEO 均 100；Performance：首页 98，其余 100。模拟数据/本地运行，不能代表生产速度或收录。原始 JSON/HTML 保留在本地 lighthouse/ 目录，未纳入源码提交。
- 工作流/Compose YAML 经项目已有 js-yaml 解析通过，部署 Bash 语法通过。本机无 Docker，可运行性仍需 CI/服务器验证。
- 本次修改的 diff --check 通过。全工作区检查受已有 globals.css 的换行/尾随空白影响，未擅自改动它或 NewsGrid。

## 剩余证据与人工操作

未取得真实服务器 .env、镜像 ID/baked ENV、Actions Variables、GSC 具体失败 URL、实际 Googlebot 来源日志。没有证据把“已抓取尚未索引”与本次技术缺口直接关联。流式 200 的错误页有明确 noindex，未改加载架构强制全部 HTTP 404。正常 TTL 过期仍可能短暂返回之前完整快照；发布主动失效链路在生产是否通畅需检查任务/日志，不在生产做内容写测试。

必须重新构建 frontend 镜像；按原有同 SHA 三组件发布流程确保完整镜像可用。本轮无新增数据库迁移。Repository Variable SEO_INDEXABLE=true 是新正式镜像前置条件；其他公开域名变量建议显式设置。服务器仅当 SEO_INDEXABLE 或站点 origin 不正确时按需人工修改相应公开行，禁止模板覆盖真实文件。本地开发仍保持禁止索引。

生产验证命令、OpenResty 修正写法、安全部署顺序和 GSC 重新提交/验证步骤见 [上线操作说明](../../docs/gsc-indexing-deployment.md)。
