# 全项目缺陷排查与修复报告（2026-09-17）

排查方式：三路并行只读排查（后端与基础设施 / 官网与后台前端 / SEO 与关键词），随后**逐条回到代码复验**
（第二批候选先用只读方式独立复验，剔除不成立项），最后对本轮全部改动做一次安全与生产可靠性复核。

- 排查范围：`backend/`、`frontend/`、`admin-next/`、`scripts/`、`docker-compose.yml`、`.github/workflows/`
- 提交状态：**本报告对应的改动全部留在工作区，未执行任何 git 提交/推送**（由项目所有者手动提交）
- 验证记录（全部在本机执行通过）：
  - 后端 `pytest`：**138 passed**（含新增 `tests/test_input_bounds.py` 4 条）
  - 前端 `eslint` + `tsc --noEmit` + `npm run verify:seo`：全部通过
  - e2e（受影响用例）：**27 passed**（`api-mapping-robustness`、`news-media-performance`、`server-resource`、`list-query-seo`、`product-news-upgrade`）
  - 部署脚本 `bash -n scripts/deploy.sh scripts/backup.sh`：通过

---

## 一、结论速览

| 级别 | 数量 | 说明 |
|---|---|---|
| P0（线上事故/安全） | 0 | 认证、RBAC、注入、上传路径、CI 门禁等方向逐条核查后**未发现可确证的高危项** |
| P1（功能错误/发布阻断） | 6 | 已全部修复并验证 |
| P2（健壮性/配置/测试） | 11 | 已修复 10 项；1 项（`GET /admin/settings` 的 RBAC）留有产品决策 |

复核阶段额外发现并当场修掉 3 处加固点（见第四节）。

---

## 二、P1：已修复

### 1. 正文清洗正则跨标签吞噬内容（内容静默损坏）
- **位置**：`frontend/lib/html-cleaner.ts:73-76`（修复后 `:77-79`）
- **机理**：`/\s*(?:max-)?width\s*:\s*[^;"]+[;"]?/gi` 在 `sanitize-html` 之前对**整篇字符串**执行，`[^;"]+`
  无边界。正文出现字面量 `width:`（如 `Screen width: 3 inch`）时，会一路吞到下一个引号，
  把中间的正文与标签（含 `<img src=`）整段删除。同文件 `:66-68` 的注释已意识到该贪婪问题，但只对 `style` 做了前置清理。
- **触发条件**：新闻正文/产品描述里出现 `width:` 或 `max-width:`（技术规格写法很常见）。
- **影响**：已发布正文静默损坏（文字缺失、图片消失），无报错、难定位。
- **修复**：改为**逐标签**改写，彻底不越出 `<...>` 边界、不触碰正文文本：
  `cleaned.replace(/<[^>]*>/g, tag => tag.replace(/\s*(?:max-)?width\s*:\s*[^;"'>]+[;"]?/gi, ""))`
- **验证**：`frontend/e2e/news-media-performance.spec.ts` 新增两条回归用例（字面量 `width:` 保留 + 标签内 `style=width:100%` 仍被清掉），并保持原有媒体属性断言全绿。

### 2. 详情映射空值缺口导致详情页 500
- **位置**：`frontend/lib/api/products.ts:163,174`（`p.galleries.map` / `p.attributes.map`，同函数 `:157` 的 `tags` 有兜底）；
  `lib/api/news.ts:70`、`lib/api/search.ts:57`、`products.ts:71`、`news.ts`/`products.ts` 的 sitemap 翻页循环
- **机理**：`apiFetch` 只做 `return json.data as T`，不做结构补全；详情页没有列表页那层 `try/catch`，
  任一字段缺失都会抛 `TypeError` 冒泡到 `app/error.tsx` → 页面 500（`http-status-code` 审计失败）。
  与已记录的 `lib/display-text.ts` 属同一类问题。
- **修复**：
  - `lib/display-text.ts`：`decodeHtmlEntities` / `normalizePublicText` / `normalizeCategoryName` / `normalizePublicSummary`
    统一接受 `string | null | undefined`，经 `asText()` 收敛为 `""`（后端字段缺失不再抛错）；
  - 所有列表/详情映射：`(data.list ?? [])`、`(p.galleries ?? [])`、`(p.attributes ?? [])`、`total ?? 0` 等兜底；
  - 顺带覆盖同源的 `getProductLinkCatalog`（新闻详情底部"相关产品内链"的数据源）与 sitemap 翻页循环。
- **验证**：新增 `frontend/e2e/api-mapping-robustness.spec.ts`（缺 `galleries/attributes`、缺 `list/items/total`、`display-text` 空值等 5 条）。

### 3. 后台询盘页遇未知状态整页白屏
- **位置**：`admin-next/src/app/(admin)/inquiries/page.tsx:331`、`:456`（另有 `:465` 同类写法）
- **机理**：直接 `NEXT_STATUS[i.status].map(...)`；同文件 `:42` 已有安全助手 `nextStatusesOf = status => NEXT_STATUS[status] ?? []`，
  属漏用。后端新增枚举态（或返回 null）时抛 `TypeError`，整个 `/inquiries` 不可用。
- **修复**：`:(admin)/inquiries/page.tsx` 三处统一改用 `nextStatusesOf(i.status)`。
- **验证**：`admin-next` 无 e2e/单测脚手架（`package.json` 仅 dev/build/start/lint/typecheck），以 `eslint` + `tsc --noEmit` 通过为准。

### 4. 分页参数无边界校验（公开接口 500 / SQLite 绕过上限）
- **位置**：`backend/common/result.py:65-77`；所有列表接口经 `PageRequest = Depends()` 复用
- **机理**：`page`/`page_size` 无 `ge/le`，`limit = min(page_size, 50)` 对负值不设防 → `?page_size=-1` 得 `limit=-1`：
  PostgreSQL 报 `LIMIT must not be negative`（500 兜底），SQLite 把负 LIMIT 当作**无上限**（返回全表）。
- **修复**：`page: int = Field(1, ge=1)`、`page_size: int = Field(20, ge=1, le=50)`（校验交回 FastAPI → 400 C400001，
  与 `uploads`/`search` 路由既有口径一致）。
- **兼容性核查**：前端最大 `page_size=50`、后台全部 `Math.min(pageSize, 50)`，无 >50 调用方；
  `uploads`（le=200）/`search`（le=50）用独立 `Query`，不经 `PageRequest`，不受影响。
- **验证**：`backend/tests/test_input_bounds.py::test_public_lists_reject_unsafe_pagination`。

### 5. 部署脚本备份门槛阻断发布
- **位置**：`scripts/backup.sh:61`（`docker compose exec -T postgres pg_dump`，**需要运行中的容器**）
  ＋ `scripts/deploy.sh:51-56`（在 `up -d postgres redis` **之前**调用备份，`set -Eeuo pipefail` + ERR trap 直接中止）
- **触发条件**：全新主机首次部署（还没有容器）；或 postgres 异常退出、恰恰需要抢修发布时。
- **影响**：发布/抢修动作被备份环节阻断。
- **修复**：
  - `deploy.sh`：把 `up -d --wait postgres redis` 提前到备份之前；新增**显式参数** `--skip-backup`
    （刻意不用环境变量，避免 CI 意外带上导致静默零备份）；未知参数以退出码 2 拒绝；
  - `backup.sh`：备份前用 `docker compose ps -q postgres` 检查运行态（不依赖 compose v2.3+ 的 `--status`），
    未运行时给出明确原因与处置建议后退出 —— 仍然"失败即失败"，不会产出空备份。
- **验证**：`bash -n` 通过；发布顺序语义（拉镜像 → 迁移 → 切换 → 冒烟 → 回滚）未改动。

### 6. 规格 slug 分隔符漂移（功能静默失效）
- **位置**：后台 `admin-next/.../product-form/page.tsx:169`（下划线 `_`）↔ 官网 `frontend/app/products/[...slug]/page.tsx:254`（只匹配 `video-resolution`）
- **影响**：运营新增规格名 "Video Resolution" → 存成 `video_resolution` → 官网产品页顶部 key facts **不显示**该规格；
  现有 e2e 夹具用连字符，因此该路径无任何用例覆盖。
- **修复（三层收敛）**：
  - 服务层作为单一口径：`backend/product/services.py` 新增 `normalize_attribute_slug()`，`add_attribute` 落库前统一为
    「小写 + 连字符」（空值回退名称）；
  - 官网保留对**历史下划线数据**的兼容匹配：`/(sensor|zoom|screen|video[-_]resolution)/`，标签展示 `replace(/[-_]/g, " ")`；
  - 后台表单同步改为连字符，避免两处口径再次分叉。
- **验证**：`backend/tests/test_input_bounds.py::test_attribute_slug_is_normalized_to_hyphen`（走真实后台接口路径）。

---

## 三、P2：已修复

| # | 缺陷 | 位置 | 修复要点 |
|---|---|---|---|
| 7 | 设置接口非对象 body → 500（另发现 `{"value":null}` 触发 NOT NULL 违约 500） | `backend/common/settings_router.py` | 新增 `_json_object_body()`（非 JSON 对象 → 400 C400001）与 `_normalize_setting_value()`（null → 空串，数字/对象 → str）；单条与批量口径统一 |
| 8 | 上传 `title`/文件名无长度上限 → ORM `MaxLengthValidator` 抛错 → 500（SQLite 同样触发） | `backend/uploads/routers.py:99`、`backend/uploads/services.py` | `Form(None, max_length=255)`；新增 `_truncate_file_name()`（保留扩展名）并在 `record_upload`、`sync_missing_uploads` 生效 |
| 9 | 管理员改密后重启被 `ADMIN_PASSWORD` 回滚（且被禁用的 admin 会被重新启用） | `backend/seed/seed_data.py`、`backend/common/config.py` | 新增 `SEED_ADMIN_PASSWORD_FORCE`（默认 `false`）：默认**不覆盖**已存在账号的口令/角色/启用状态；仅空口令兜底（security-audit F-04）无条件执行 |
| 10 | `CORS_ORIGINS` 为空时后台写请求全 403（且启动无提示） | `docker-compose.yml` | 改为 `${CORS_ORIGINS:?...}` 必填守卫（CI 的 compose 作业会 `cp .env.example .env`，其中已有值，不受影响） |
| 11 | `REDIS_REQUIRED` 未进模板：非 Compose 部署会在 Redis 故障时**静默**降级为进程内内存（多 worker 下登出黑名单/幂等/限流失效，`/readyz` 仍 200） | `backend/.env.example` | 补键 + 注释说明生产/多 worker 必须为 `true` |
| 12 | 搜索页 `page` 未归一化（负数/小数直达后端 → 400 或自相矛盾的分页文案）；文件头注释与 `force-dynamic` 矛盾 | `frontend/app/search/page.tsx` | 改用全站统一口径 `readListQuery(sp)`；修正过期注释 |
| 13 | 英文官网把中文 `ApiError.message`（含后端 msg）渲染给访客 | `frontend/app/search/page.tsx` | 页面固定英文兜底 + `console.error` 保留原始错误；`client.ts` 中文保留给日志与后台（后台复用 `payload.msg`） |
| 14 | 证书 `alt` 混中文（a11y / 图片 SEO） | `frontend/components/CertificateGallery.tsx:105,152` | 改为 `${title} certificate` / `… enlarged view` |
| 15 | 搜索结果 `url` 只判 `startsWith("/")`，协议相对地址（`//evil.example.com`）可穿过 | `frontend/lib/api/search.ts` | 追加 `&& !it.url.startsWith("//")`。**说明**：当前后端恒拼接 `/products/`、`/news/` 前缀，实际不可达，属防御性收紧 |
| 16 | 新闻"上一篇/下一篇"每次渲染串行全量翻页，且缺少翻页上限 | `frontend/lib/api/news.ts` | 加 `cache()` 与 `MAX_ADJACENT_PAGES=200`（对齐 `gen-canonical-map.mjs`）。**说明**：唯一调用点每次渲染只调一次，且 `apiFetch` 默认 ISR 60s，原主张（无缓存导致重复请求）不成立，此项属防御性 |
| 17 | e2e 用例硬编码真实产品 slug（`dc226`），与 `npm run gen:map` 生成物隐性耦合 | `frontend/e2e/server-resource.spec.ts` | 改为从 `CANONICAL_MAP` 动态取键，映射为空时 `test.skip`（符合 AGENTS.md「禁止硬编码真实内容 slug」） |

---

## 四、复核阶段新增的三处加固

| 复核发现 | 处置 |
|---|---|
| `seed_data.py:89-90` 仍无条件覆盖 `role_id/status`：被运维禁用/回收角色的 admin 每次重启会被重新启用 —— 与本次修复目标自相矛盾 | 已改为仅在 `SEED_ADMIN_PASSWORD_FORCE=true` 时覆盖（空口令兜底例外） |
| `SKIP_BACKUP` 用环境变量时，任何 CI/脚本导出即静默跳过备份 | 已改为**仅接受 CLI 参数** `--skip-backup`，未知参数退出码 2 |
| `docker compose ps --status running` 依赖 compose ≥ v2.3，低版本会被 `2>/dev/null` 吞掉并误判为"未运行" | 已改用版本无关的 `docker compose ps -q postgres` |

复核结论：其余改动（清洗正则作用域、400 映射、`PageRequest` 边界、空值兜底完整性、`about` 的 `ABOUT.hero.title`、
`contact` 移除重复 Organization、slug 归一化、上传截断、`CORS_ORIGINS` 守卫）逐条**通过**。

---

## 五、未修复 / 需人工决策

| # | 事项 | 现状与建议 |
|---|---|---|
| A | ~~`GET /api/v1/admin/settings` 仅校验登录、无 RBAC（会返回 `smtp_host`/`smtp_user`/收发件箱；口令已脱敏）~~ → **已按方案 C 修复（2026-09-17 补做）** | 读范围随权限收缩：无 `settings:update` 的账号只返回 `PUBLIC_SETTING_KEYS` 白名单，`smtp_host`/`smtp_user`/`inquiry_email_from`/`inquiry_email_to` 不再出现在响应里；采用「默认拒绝 + 白名单裁剪 key」而非逐字段掩码 —— 设置页只对 `smtp_password` 的 `******` 做「不修改」跳过，抹其它字段会被当真实值回写（数据损坏）。零权限码/零种子/零迁移，前端未改。对照用例：`backend/tests/test_rbac.py::test_settings_read_is_scoped_for_low_permission_role`、`::test_settings_read_includes_sensitive_keys_for_admin` |
| B | `docker-compose.yml` 的 `ADMIN_PASSWORD: ${ADMIN_PASSWORD}` 未加 `:?` 守卫（与新增的 `CORS_ORIGINS` 风格不一致） | 未改（超范围）。若希望"缺配置即启动失败"，可同样加守卫 |
| C | `frontend/lib/seo.ts` 的 `localBusinessSchema()` 在 contact 页移除重复输出后成为无调用者的导出 | 保留（语义清晰、便于将来单独使用）。如需彻底清理死代码可删除 |
| D | `backend/uploads/routers.py:95` 的 `@audit(resource="media:{file_name}")` 无法从形参 `file` 解析，审计资源名退化为字面量 | 既有行为、不阻断，可改为 `media:{file}` |
| E | `getAdjacentPosts` 的 `cache()` 与 `MAX_ADJACENT_PAGES` 属防御性；`getAllPostSlugs` / `getAllProductSlugEntries` 的同类翻页循环仍无上限 | 建议后续统一加 `MAX_PAGES`（当前不构成缺陷） |
| F | `frontend/lib/api/news.ts` 的 `getPostsCached` 等 `data.list` 已兜底，但后端字段命名/必填性仍无强校验（`apiFetch` 只做 `as T`） | 属架构层面：可考虑引入运行时 schema 校验（zod）作为长期改进 |

---

## 六、行为变更提示（发布时需知悉）

1. **`SEED_ON_START=true` 的语义收窄**：不再覆盖已存在账号的口令/角色/启用状态。此前依赖"改 `.env` 的
   `ADMIN_PASSWORD` → 重启即同步口令"的流程需改用后台改密，或显式设 `SEED_ADMIN_PASSWORD_FORCE=true`。
2. **`CORS_ORIGINS` 成为必填**：缺失时 `docker compose` 直接失败（此前是启动成功但后台写请求全部 403）。
3. **`page_size` 上限 50 变为硬约束**：超过 50 的请求从"静默截断为 50"改为 400。已核查仓库内无 >50 调用方。
4. **`{"value": null}` 语义**：设置接口由"写 None（500）"改为"清空为空串"。
5. **`GET /api/v1/admin/settings` 读范围收缩**：无 `settings:update` 的账号只拿到公开白名单项（不再是登录即可读全表）。
6. **`ADMIN_PASSWORD` 在 Compose 中成为必填**：服务器 `.env` 未填时任何 `docker compose` 命令都会直接失败（此前是带着空/默认口令启动）。

---

## 七、本机 Lighthouse 复核（CI 同条件）

复核条件与 CI 一致：**空数据 mock（`MOCK_API_PORT=8100`）+ 临时移开 `frontend/.env.local`（即缺 `NEXT_PUBLIC_SITE_URL`）**，先删 `.next`/`.lighthouseci` 再构建。

- 生产构建：**`BUILD_EXIT=0`**
- 审计结果（口径完全同 `frontend/lighthouserc.cjs`，**未放宽任何阈值**）：

| 页面 | performance | accessibility | best-practices | **seo** | LCP | CLS | TBT | total | script |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 1.00 | 0.95 | 0.96 | **1.00** | 681ms | 0 | 0 | 424KB | 174KB |
| `/products` | 1.00 | 0.95 | 0.96 | **1.00** | 588ms | 0 | 0 | 350KB | 176KB |
| `/news` | 1.00 | 0.95 | 0.96 | **1.00** | 592ms | 0 | 0 | 352KB | 176KB |
| `/contact` | 1.00 | 0.91 | 0.96 | **1.00** | 715ms | 0 | 0 | 445KB | 263KB |

结论：**ALL ASSERTIONS PASSED**（阈值 performance ≥0.8 / a11y ≥0.9 / best-practices ≥0.9 / seo ≥0.95 / LCP ≤3000 / CLS ≤0.1 / TBT ≤300；预算 total ≤3584KB、script ≤700KB）。
对比事故时的 CI（`/news` 的 `categories.seo = 0.92`，唯一失败项 `meta-description=0`），**空数据 + 缺站点 URL 这条最容易翻车的路径现在四页 SEO 满分**。

### 复现注意事项（本机 Windows 特有的坑，已定位）

1. `npm run lighthouse`（`lhci autorun`）在本机会在第一个页面收尾时抛
   `EPERM ... Launcher.destroyTmp → rmSync`，报告不落盘；随后 `lhci assert` 会以 **"Checking assertions against 0 URL(s)"** 空跑通过 —— **看 `ASSERT_EXIT=0` 会被误导，必须看采集到的 URL 数**。
2. 上述 EPERM 的真因是 **Chrome 无法绑定 DevTools 端口**：本机 `netsh interface ipv4 show excludedportrange protocol=tcp` 显示 Windows 保留了
   `9139–9238`、`9246–9345`（另有 `8367–8466`、`8567–8766` 等），而 chrome-launcher 随机选的端口落进保留区间 → `Cannot start http server for devtools` → Chrome 退出不干净 → 临时 profile 被锁 → 清理失败。
3. 可用做法（本次采用，未改任何配置文件）：自起 `next start -p 3200` 与常驻 headless Chrome（`--remote-debugging-port=8123`，**8123 不在任何保留区间内**），再用
   `node node_modules/lighthouse/cli/index.js <url> --port=8123 --preset=desktop ...` 逐页审计；报告写入 `frontend/.lighthouseci/reports/*.report.json`，可直接被 `scripts/report-lighthouse-failures.mjs` 解析。
4. 另外两点环境细节：`spawn` 的 `stdio` 必须传 `openSync` 得到的 fd（`createWriteStream` 是惰性 fd，会抛 `ERR_INVALID_ARG_VALUE`）；`npm run start` 在本项目会提示
   `"next start" does not work with "output: standalone"`（CI 侧同样如此，未改动）。
5. 本机收尾时的遗留进程（端口未被其它服务使用，可随时清理）：`8100` 空数据 mock、`3100` 上一轮的孤儿 `next start`。
