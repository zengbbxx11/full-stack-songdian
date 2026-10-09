# Google Search Console 索引排查与上线操作（2026-10-09）

本轮仅修复技术 SEO 和部署检查。没有更改布局、动画、正文、数据库结构、现有 URL 或真实环境文件，也没有执行生产部署。生产 HTTP 证据与本地验证见 [专项报告](../reports/seo-indexing-2026-10-09/report.md)。

## 当前结论与证据边界

正式 www 站点的 robots.txt / sitemap.xml 当前均为 HTTP 200。Sitemap 是合法 XML，含 8 个静态页、6 个非空产品分类、42 个已发布产品、8 篇已发布新闻，共 64 个 URL。本次逐个 GET 均为 200、无意外 noindex，canonical 与 Sitemap 一致。公开 API 返回产品 42、新闻 8，与图中详情页完全一致。这是当次快照，不能写成固定业务数量或据此保证 Google 收录。

本地根目录 .env 不存在；frontend/.env.local 存在，公开站点地址为 http://localhost:3000，未显式设置 SEO_INDEXABLE，因此默认禁止索引。这是合理的本地配置，不能据此推断服务器。未读取或输出真实文件的其他值。

无法访问生产服务器配置、运行镜像标识、GitHub Actions Repository Variables、GSC 报告具体 URL、实际 Googlebot 访问日志。Googlebot User-Agent 检查仅代表此请求入口；需要 GSC 实时测试和服务器日志确认 Google 实际抓取。

## 本地修复

1. 正式 frontend 镜像构建不再把缺失 Repository Variable SEO_INDEXABLE 静默回退成 false。镜像 job 在 build-push 前要求 SEO_INDEXABLE=true，并检查 NEXT_PUBLIC_SITE_URL 为有效公网 HTTPS origin。此守卫仅用于原有正式镜像 job，本地 Compose、Dockerfile 和开发模板仍默认禁止索引。
2. Sitemap 全量读取校验分页结构、total、页码、每页数量、发布状态、slug、重复 URL，以及翻页过程中总数稳定性。最多 200 页，每页 50 条；每个资源的全量读取预算 15 秒，单请求最多 10 秒。产品还校验分类 slug 与 lastModified，避免静默过滤无分类产品。真实空目录允许返回静态页；缺失 list/total、非法数据或不完整分页必须失败。
3. 保留运行时 Metadata Route、60 秒完整成功快照缓存和 products/news/product-categories 标签。冷缓存或发布主动失效后，后端错误仍传播为 Next HTTP 500，不缓存错误，不返回虚假的静态页成功图。普通 TTL 过期时可能暂用上一份完整快照并后台刷新，这是已有机制。产品/新闻发布、撤回、分类变更沿用后台持久化任务 -> /api/revalidate -> 标签与 /sitemap.xml 失效链路。
4. 404 元数据明确 noindex，并清除根布局的首页 canonical；缺失产品在 generateMetadata 中调用 notFound()。既有 404 JSX、加载骨架和 308 永久重定向均保留。动态详情在流式响应开始后发现不存在时仍可能返回 HTTP 200，但 robots 与 googlebot 均 noindex，且不再错误声明首页 canonical。普通未知路径返回 404。
5. 部署冒烟新增无依赖 Python SEO 检查：内部入口与公开 HTTPS 入口分别检查 Robots、真实 XML、Sitemap URL 唯一性/域名/抓取权限、首页/产品/新闻/静态页/代表性详情及分类的 canonical 和索引指令，并确认搜索/无效预览 noindex。内部检查比较完整的公开 API 数据，防止静态页成功掩盖动态条目缺失。部署失败沿用原有应用镜像回滚逻辑。此检查不修改内容。
6. CI 纳入生产变量守卫测试、Python 检查器回归、Sitemap 缓存异常恢复集成回归；既有 E2E 自动发现新增分页与错误页用例。

## 人工确认生产变量

在 GitHub 仓库 Settings -> Secrets and variables -> Actions -> Variables 检查/设置：

| Repository Variable | 正式站值 |
| --- | --- |
| SEO_INDEXABLE | true（必须显式设置） |
| NEXT_PUBLIC_SITE_URL | https://www.zsaki.icu |
| NEXT_PUBLIC_API_URL | https://api.zsaki.icu |
| NEXT_PUBLIC_IMAGE_HOST | api.zsaki.icu |

后面三个有现有正式域名回退值，仍建议显式设置便于核对。images job 没有声明 production Environment，因此仅配置在 GitHub production Environment 中的 Variables 不会自动用于镜像构建。不要用测试 job 中的 SEO_INDEXABLE=true 代替镜像 job 配置。

服务器根目录 .env 的公开配置应为：

```dotenv
SEO_INDEXABLE=true
NEXT_PUBLIC_SITE_URL=https://www.zsaki.icu
NEXT_PUBLIC_API_URL=https://api.zsaki.icu
NEXT_PUBLIC_IMAGE_HOST=api.zsaki.icu
```

仅核对并按需编辑这些行，保留全部现有密钥与其他配置。不要复制模板覆盖真实 .env。若已有正确值，无须修改。frontend/.env.local 是本地开发配置，保持 localhost 和禁止索引；不要复制到生产镜像。

以下命令只打印公开 SEO 配置，不要改成输出全部 docker inspect/Compose config/环境文件：

```bash
cd /home/ubuntu/full-stack-songdian

# Compose 从服务器 .env 解析出的构建与运行配置（不输出其他配置）
docker compose config --format json | python3 -c '
import json,sys
frontend=json.load(sys.stdin)["services"]["frontend"]
for scope,values in [("build",frontend.get("build",{}).get("args",{})),("runtime",frontend.get("environment",{}))]:
    for key in ("SEO_INDEXABLE","NEXT_PUBLIC_SITE_URL"):
        print(scope,key,values.get(key))
'

# 正在运行的容器
docker compose exec -T frontend node -e '
console.log(JSON.stringify({
  SEO_INDEXABLE:process.env.SEO_INDEXABLE,
  NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL
}))
'

# 运行容器所用镜像的 baked ENV（排除运行时 Compose 覆盖）
frontend_id=$(docker compose ps -q frontend)
frontend_image=$(docker inspect --format '{{.Image}}' "$frontend_id")
docker image inspect --format '{{json .Config.Env}}' "$frontend_image" | python3 -c '
import json,sys
for item in json.load(sys.stdin):
    if item.startswith(("SEO_INDEXABLE=","NEXT_PUBLIC_SITE_URL=")):
        print(item)
'
```

镜像 ENV 是构建参数的辅助证据；同时对照同一 SHA 的 CI build-args 与静态页面源 HTML。仅运行期 true 无法修正旧镜像中构建时生成的 noindex。域名或索引变量变更必须重新构建 frontend 镜像。

## 人工修复根域 OpenResty 入口

本次从检查入口访问 https://zsaki.icu/ 遇到证书名称校验失败。仅为诊断加 -k 后看到 301 Location: https://www.zsaki.icu//。http://zsaki.icu/ 先跳到 https://zsaki.icu/，增加一跳并进入上述 TLS 问题。www HTTPS 可正常验证。

需要在服务器及另一个网络入口复核证书/SNI、DNS 和 1Panel 配置，不能把检查器看到的证书错误直接当成已确定的服务器证书内容。确认后：

- 根域的 HTTPS 证书必须覆盖 zsaki.icu，TLS 成功后才能发送重定向。
- 在 1Panel 现有根域 HTTP 和 HTTPS 站点中修正到最终 www HTTPS origin；保留 ACME 校验配置。
- 重定向目标拼接使用 $request_uri，本身已含前导 /，域名后不要再额外加 /。
- 不修改官网 HTTPS 站点的正常反向代理，不把旧产品 URL 统一重定向到首页。

现有根域重定向规则的目标写法应为（嵌入合适的现有 server/location，不能盲目覆盖整个站点配置）：

```nginx
return 301 https://www.zsaki.icu$request_uri;
```

修改后先在实际 OpenResty 容器执行 nginx -t，再通过 1Panel 重载。然后保留证书校验复测：

```bash
curl -sS -I http://zsaki.icu/
curl -sS -I https://zsaki.icu/
curl -sS -I http://www.zsaki.icu/
curl -sS -IL --max-redirs 5 'http://zsaki.icu/products?category=compact-camera'
```

最终 URL 应为 https://www.zsaki.icu/products?category=compact-camera，路径、query 保留，没有双斜杠或循环。不要用 -k 的成功结果作为上线验收。

## 安全部署步骤（人工执行）

1. 检查本地 git diff，单独处理已有 globals.css/NewsGrid 等工作区改动；不要把真实 .env、日志或临时验证目录加入提交。将本轮新增源码、脚本、测试和文档纳入待发布 commit。
2. 先配置 Repository Variables 与服务器公开环境项；CI 必须对同一 commit 完成原有全部测试和三个 images job。新的守卫会阻止缺失/false 索引配置的 frontend 镜像发布。
3. 必须使用新 frontend 镜像；本轮未新增 backend/admin 功能或数据库迁移。现有部署仍按同一 SHA 获取三个组件并执行原有 migrate 流程，所有组件镜像均需可用。服务器 .env 不会重写已发布的 GHCR 镜像。
4. 保留原有数据库/上传媒体备份，核对 .deploy/current-version 记录的可回滚版本。运行既有 Deploy production workflow，image_version 选择 CI 成功产出的完整 SHA；或更新服务器源码并核对 SHA 后使用原有 scripts/deploy.sh。不要跳过备份，不执行 down -v，不覆盖数据卷。
5. deploy workflow 已上传 seo-smoke.py；手动部署也必须包含它。服务器原有 smoke 依赖 Python 3，新 SEO 检查无新增第三方包。deploy.sh 从运行容器读取公开站点地址，再执行内部/API完整性检查和公网 TLS 检查。若失败，按原有逻辑回滚应用镜像；数据库迁移和 .env 不会自动回滚。
6. 检查服务器是否能解析、访问本机公开 HTTPS 域名；边缘故障、证书问题或网络限制也会使公开 SEO gate 失败，需要修复真实原因，而非删掉断言或伪造成功。
7. 不要求修改真实 .env 中已正确的值。Dockerfile/Compose 已同时传递构建与运行配置，保持原实现即可。

部署后可以单独执行只读公网检查：

```bash
python3 scripts/seo-smoke.py \
  --base-url https://www.zsaki.icu \
  --site-url https://www.zsaki.icu \
  --api-url https://api.zsaki.icu

curl -sS -D - https://www.zsaki.icu/robots.txt
curl -sS -D - https://www.zsaki.icu/sitemap.xml
curl -sS -I https://www.zsaki.icu/products/dc417x
curl -sS -I https://www.zsaki.icu/products/compact-camera/dc417x
```

## Google Search Console 复核（人工操作）

1. 确认所属 Property 覆盖 https://www.zsaki.icu/。在“站点地图”提交或重新提交 sitemap.xml，查看新的最后读取时间、成功状态和发现 URL 数；数量随后台发布变化，不应硬编码 64。
2. 用“网址检查 -> 测试实际网址”检查首页、产品列表、产品 canonical 详情和新闻详情，确认允许抓取、允许索引、返回页面正确，并核对用户声明/Google 选择的规范 URL。
3. 对重要的有效 canonical URL 请求编入索引。无需对正常 308 历史 URL 请求收录；重定向记录可以继续出现在历史报告中。
4. 对确实修复的报告项点击“验证修复”。真实删除且无替代内容的页面维持 404/noindex；不要为了消除记录重定向到无关首页。当前未取得 GSC 那 6 个具体 URL，必须逐个识别其用途后决定。
5. “已抓取，尚未编入索引”不等于技术配置有误；继续观察内容价值、内链和规范选择。canonical 是提示，Google 可以选择不同地址。不要通过 noindex 规范页、伪造 Sitemap 或取消合理重定向追求全部变绿。
6. 若站点地图仍无法抓取，检查新版读取时间、GSC 实时测试、OpenResty 访问/错误日志、WAF/限流、DNS/TLS、后端/前端错误日志和网络入口差异。此处没有登录 GSC 或实际 Googlebot 来源日志的证据。

官方依据：[Google Sitemap 提交](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[规范 URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[noindex 与抓取](https://developers.google.com/search/docs/crawling-indexing/block-indexing)、[Next.js not-found 流式状态](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)。
