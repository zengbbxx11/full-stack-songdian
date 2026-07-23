# 后台管理界面（admin UI）+ 补齐后端缺口 — 系统设计与任务分解

> **架构师**：高见远（Bob）｜ **阶段**：用户 4 个原始诉求之第 4 个（前 3 个已完成）
> **范围**：后台管理前端（admin）对接真实后端 API + 后端 3 个缺口补齐（分类写/排序、图片上传、后台按 ID 详情）
> **策略**：只做设计，不写实现代码。第一轮切片 = P0 前端三模块 + 后端 3 缺口；P1/P2 为后续阶段占位。

---

## 0. 现状核实结论（基于真实代码，非假设）

### 0.1 后端 `backend/`（FastAPI + Tortoise 1.1.7 + aerich + PostgreSQL）
| 项 | 现状 | 出处 |
|---|---|---|
| 产品 CRUD | ✅ 公开 `GET /products`、`GET /products/{slug}`；写 `POST/PUT/DELETE /admin/products/{id}`（带 RBAC + `@audit`） | `product/routers.py` `product/services.py` |
| 新闻 CRUD | ✅ 同结构 `news/routers.py` | `news/routers.py` |
| 分类 | ⚠️ **仅公开只读** `GET /product-categories`、`GET /news-categories`；**无任何写/排序接口** | `product/routers.py` `news/routers.py` |
| 图片上传 | ❌ **全局缺失**（当前图片靠 ETL 从 WP 拉，落 `backend/uploads`，已 `StaticFiles` 挂载 `/uploads`） | `main.py` |
| 后台按 ID 详情 | ❌ **缺失**（仅有按 slug 的公开详情，admin 编辑拿不到后端单条全量） | `product/services.py` |
| 鉴权 | ✅ `POST /api/v1/admin/login`、`/admin/logout`、`require_permission(code)`、`get_current_user`、`@audit` 齐全 | `content/routers.py` `common/deps.py` |
| JWT | ✅ access 2h / refresh 7d 已签发，但**无 refresh 端点** | `common/jwt.py` `content/schemas.py` |
| 种子账号 | ✅ `seed_on_start=True` 幂等创建 `admin / Songdian@2026` | `seed/seed_data.py` |
| 统一返回 | ✅ `Result{code,msg,msgI18n,data,traceId,timestamp}`，成功 `code="0"`；分页 `PageResponse{list,total,page,page_size}` | `common/result.py` |
| 软删 | ✅ `SoftDeleteMixin.deleted`（0/1），列表均 `filter(deleted=0)` | `common/mixins.py` |
| **额外发现** | ① `ProductCreateRequest/UpdateRequest` **缺 `tags` 字段**（模型 `Product.tags` JSONField、VO `tags` 均有，写入链路断）；② `content/permissions.py` 无 `category:*` / `media:upload` 权限码；③ `LoginVO` 无 `expires` 字段 | `product/schemas.py` `content/permissions.py` |

### 0.2 前端 `admin/`（vue-pure-admin：Vue3 + Element Plus + Pinia + Vite + axios）
| 项 | 现状 | 出处 |
|---|---|---|
| 脚手架 | 完整脚手架，**无真实业务页面**（`src/views` 全为演示页，`src/mock` 为空） | `ls src/views` |
| 请求层 | `PureHttp`：请求拦截自动附加 `Authorization: Bearer <token>`；响应拦截 `return response.data`；白名单 `url.endsWith("/login"｜"/refresh-token")` | `src/utils/http/index.ts` |
| 登录示例 | `getLogin` → `POST /login`，返回 `UserResult{accessToken,refreshToken,roles,permissions,...}`，`code` 为**数字 0** | `src/api/user.ts` |
| Token 存储 | `setToken(DataInfo)` 需 `accessToken/refreshToken/expires/roles/permissions` | `src/utils/auth.ts` |
| 路由 | **自动扫描** `src/router/modules/**/*.ts`（除 `remaining.ts`）→ 菜单自动生成；新增业务只需加模块文件 | `src/router/index.ts` |
| 按钮权限 | `hasPerms(code)` + `v-auth` 指令，基于 `useUserStore().permissions` | `src/utils/auth.ts` |
| 富文本 | 已装 `@wangeditor/editor` + `@wangeditor/editor-for-vue`，`views/editor` 存在 | `package.json` |
| 上传组件 | 示例 `formUpload` 用 `multipart/form-data`；`cropperjs` 已装；`el-upload` 自带 | `src/api/mock.ts` |
| 代理 | `vite.config.ts` 的 `server.proxy` **为空**，需补 `/api` → 后端 | `vite.config.ts` |

### 0.3 关键集成差异（必须适配）
| 维度 | 后端现状 | 前端脚手架约定 | 适配方式 |
|---|---|---|---|
| `code` | 字符串 `"0"` | 数字 `0`（`store.loginByUsername` 用 `=== 0`） | 前端比较改 `=== "0"`，或映射层归一 |
| 字段命名 | 蛇形 `access_token`/`refresh_token` | 驼峰 `accessToken`/`refreshToken` | 前端 `api/user.ts` 加映射函数 |
| `expires` | 无 | `setToken` 必需（过期时间戳） | 后端 `LoginVO` 增加 `expires_at`，或前端按 `access_token_ttl` 计算 |
| 路径 | `/api/v1/admin/*` | 示例 `/login` | `vite.config.ts` 配 `/api` 代理；`api/*` 改真实路径 |

---

## 1. 实现方案 + 框架/库选型

### 1.1 总体原则
- **前端不另起炉灶**：复用 vue-pure-admin 的 `PureHttp` 请求层、`/src/api/*` 分层、`pinia user store`、`router/modules` 自动菜单、`v-auth` 按钮级权限。仅在"字段映射适配层"做蛇形↔驼峰 + `code` 归一，**不改动 `PureHttp` 内核**。
- **后端不破坏现有约定**：所有新接口沿用 `/api/v1` 前缀、`Result` 返回、`require_permission` + `@audit`、`SoftDeleteMixin`、分页 `PageResponse`。
- **分类写接口就地归属**：产品分类写接口加在 `product/routers.py`（模型在此），新闻分类写接口加在 `news/routers.py`，**不新建独立 category router**，减少跨模块耦合。
- **图片上传独立成 `uploads/` 模块**：与"媒体"语义一致，便于后续切对象存储。

### 1.2 三个后端缺口的接口设计（路由 / 入参 / 出参 / 权限依赖）

#### 缺口①：分类写 / 排序（产品分类 + 新闻分类）
| 方法 & 路径 | 入参 | 出参 | 权限依赖 |
|---|---|---|---|
| `POST /api/v1/admin/categories` | `CategoryCreate{name, slug, sort_order?}` | `CategoryVO` | `category:create` |
| `PUT /api/v1/admin/categories/{id}` | `CategoryUpdate{name?, slug?, sort_order?}` | `CategoryVO` | `category:update` |
| `DELETE /api/v1/admin/categories/{id}` | — | `Result(msg="已删除")` | `category:delete` |
| `PUT /api/v1/admin/categories/sort` | `ReorderReq{ids: int[]}`（按数组顺序重排 `sort_order`） | `Result` | `category:update` |
| `GET /api/v1/admin/categories` | `PageRequest` | `PageResponse<CategoryVO>`（含已软删前台的隔离） | `category:read` |

> 新闻分类同构，路径前缀改为 `/api/v1/admin/news-categories`，权限码 `news:category:*`。
> 公开只读 `GET /product-categories` 保留（前台用），后台列表 `GET /admin/categories` 供管理页用（含分页/排序）。
> **排序实现**：`/sort` 接收目标顺序的 `id` 数组，按索引写回 `sort_order`；前端用 `vuedraggable`（`package.json` 已装）拖拽后提交。

#### 缺口②：图片上传
| 方法 & 路径 | 入参 | 出参 | 权限依赖 |
|---|---|---|---|
| `POST /api/v1/admin/upload` | `multipart/form-data`：`file`（单文件） | `UploadVO{url, file_name, size}` | `media:upload` |
| `POST /api/v1/admin/upload/batch` | `files`（多文件） | `List<UploadVO>` | `media:upload` |

> 存储抽象为 `StorageBackend` 接口：`LocalStorageBackend`（默认，写 `MEDIA_ROOT`，返回 `{MEDIA_URL}/2026/xx.jpg` 相对 URL）。后续切 OSS/COS 仅新增实现 + 改 `settings`。
> 校验：类型白名单（jpg/png/webp/gif）、单文件 ≤ `max_upload_mb`（默认 10MB），由 `common/config.py` 配置。
> 落库：`UploadRecord`（新模型）记录 `url/uploaded_by`，供审计溯源（可选，不阻塞主流程）。

#### 缺口③：后台按 ID 详情（产品 + 新闻）
| 方法 & 路径 | 入参 | 出参 | 权限依赖 |
|---|---|---|---|
| `GET /api/v1/admin/products/{id}` | — | `ProductDetailVO`（含 `tags`/`galleries`/`attributes`，可见软删态） | `product:read` |
| `GET /api/v1/admin/news/{id}` | — | `NewsDetailVO`（同构） | `news:read` |

> 公开详情按 `slug`（前台用）保持不变；后台编辑走按 `id` 接口，避免 slug 冲突/暴露。
> **顺带补齐**：`ProductCreateRequest`/`ProductUpdateRequest` 增加 `tags: list[str] = []`，`services.create/update_product` 写入 `Product.tags`（满足"admin 产品表单可编辑 tags"）。

### 1.3 登录 / 刷新对接
- 登录：`POST /api/v1/admin/login` 已存在，前端 `api/user.ts` 改真实路径 + 字段映射（`access_token→accessToken`，补 `expires`）。
- 刷新：新增 `POST /api/v1/admin/refresh`（`RefreshRequest{refresh_token}` → 新 `LoginVO`）；前端 `user.ts.handRefreshToken` 改调该路径，`PureHttp` 白名单已含 `/refresh-token` 需改为 `/admin/refresh`（或白名单改 `endsWith("/refresh")`）。

### 1.4 框架 / 库选型
| 层 | 选型 | 说明 |
|---|---|---|
| 前端请求 | `PureHttp`（复用） | 不改内核，仅映射层 |
| 前端表格 | `@pureadmin/table`（已装） | 列表页模板 |
| 前端表单 | `Element Plus el-form` | 编辑页 |
| 前端上传 | `el-upload` + `cropperjs`（已装） | 封面/图库，P1 封装 |
| 前端富文本 | `@wangeditor/editor`（已装，P2） | 零新依赖 |
| 前端拖拽排序 | `vuedraggable`（已装） | 分类排序 |
| 后端上传 | `python-multipart`（新增依赖）+ `aiofiles`（可选异步写） | 处理 `multipart` |
| 后端存储 | 本地磁盘 `MEDIA_ROOT`（复用 `StaticFiles` 挂载） | 抽象 `StorageBackend` |

---

## 2. 文件清单（相对 `backend/` 与 `admin/src/`）

### 2.1 后端 `backend/`
| 动作 | 文件 | 说明 |
|---|---|---|
| 修改 | `content/permissions.py` | 新增 `CATEGORY_READ/CREATE/UPDATE/DELETE`、`NEWS_CATEGORY_*`、`MEDIA_UPLOAD` 权限码并纳入 `ALL_PERMISSIONS` 与 `operator` 默认角色 |
| 修改 | `content/schemas.py` | `LoginVO` 增加 `expires_at: int`；新增 `RefreshRequest` |
| 修改 | `content/routers.py` | 新增 `POST /admin/refresh` |
| 修改 | `product/routers.py` | 新增分类写/排序 4 端点 + 后台按 ID 详情 + 批量端点（P1） |
| 修改 | `product/schemas.py` | `ProductCreate/UpdateRequest` 加 `tags`；新增 `CategoryCreate/Update/ReorderReq`、`ProductBatchReq` |
| 修改 | `product/services.py` | `create/update_product` 写 `tags`；新增 `get_product_by_id`、`create/update/delete/reorder_category`、`batch_product` |
| 修改 | `news/routers.py` | 新增新闻分类写/排序 + 后台按 ID 详情 |
| 修改 | `news/schemas.py` | 新增新闻分类 DTO + 新闻详情 VO |
| 修改 | `news/services.py` | 新增 `get_news_by_id`、新闻分类写/排序 |
| 修改 | `common/config.py` | 新增 `max_upload_mb`、`storage_backend` 配置 |
| 修改 | `common/mixins.py` | （无需改） |
| **新建** | `uploads/__init__.py` | 上传模块包 |
| **新建** | `uploads/routers.py` | `POST /admin/upload`、`/admin/upload/batch` |
| **新建** | `uploads/services.py` | `StorageBackend` 抽象 + `LocalStorageBackend` + 保存逻辑 |
| **新建** | `uploads/models.py` | `UploadRecord` 模型 |
| 修改 | `main.py` | `include_router(upload_router)`；`config.tortoise_modules` 加 `"uploads.models"` |
| 新建 | `migrations/`(aerich) | 为 `UploadRecord` 生成迁移（`aerich migrate && aerich upgrade`） |

### 2.2 前端 `admin/src/`
| 动作 | 文件 | 说明 |
|---|---|---|
| 修改 | `vite.config.ts` | `server.proxy['/api']` → `http://localhost:<backend.port>` |
| 修改 | `src/api/user.ts` | `getLogin` 改 `/api/v1/admin/login` + 返回类型映射；新增 `getRefreshToken`（→ `/api/v1/admin/refresh`）；补 `LoginVO`→`DataInfo` 映射函数 |
| 修改 | `src/store/modules/user.ts` | `loginByUsername` 映射字段 + `code === "0"`；`handRefreshToken` 调 refresh 端点；`logOut` 调 `/admin/logout`（可选） |
| 修改 | `src/utils/auth.ts` | `setToken` 兼容 `expires_at`（后端给时间戳）或前端按 TTL 计算 |
| **新建** | `src/api/product.ts` | `listProducts/getProduct/getProductDetail/createProduct/updateProduct/deleteProduct/batchProduct` |
| **新建** | `src/api/news.ts` | 同构新闻接口 |
| **新建** | `src/api/category.ts` | `listCategories/createCategory/updateCategory/deleteCategory/sortCategories`（产品+新闻两套） |
| **新建** | `src/api/upload.ts` | `uploadImage/uploadBatch`（FormData） |
| **新建** | `src/views/product/index.vue` | 产品列表页（表格 + 搜索 + 批量选择 + 新建/编辑/删除按钮 `v-auth`） |
| **新建** | `src/views/product/edit.vue` | 产品编辑页（含 tags 多选、封面/图库上传、富文本 P2） |
| **新建** | `src/views/news/index.vue` | 新闻列表页 |
| **新建** | `src/views/news/edit.vue` | 新闻编辑页 |
| **新建** | `src/views/category/index.vue` | 分类管理页（产品/新闻 Tab + `vuedraggable` 拖拽排序） |
| **新建** | `src/router/modules/product.ts` | 产品路由 + 菜单 meta（icon/title/rank/roles） |
| **新建** | `src/router/modules/news.ts` | 新闻路由 + 菜单 |
| **新建** | `src/router/modules/category.ts` | 分类路由 + 菜单 |
| **新建** | `src/router/modules/system.ts` | 系统（审计日志/角色权限）路由（P2） |
| **新建**（P1） | `src/components/Upload/ImageUpload.vue` | 上传组件封装（进度 + 裁剪） |
| **新建**（P2） | `src/views/system/audit.vue`、`src/views/system/role.vue` | 审计日志页 / 角色权限管理页 |

---

## 3. 数据结构 / 接口（类图）

> 完整 Mermaid 见同目录 `admin-ui-class-diagram.mermaid`。要点：
> - 现有模型 `ProductCategory / Product / ProductGallery / ProductAttribute / NewsCategory / News` 外键与软删关系不变。
> - 新增 `UploadRecord`（上传溯源）。
> - API 契约以 `AuthAPI / ProductAdminAPI / CategoryAdminAPI / UploadAPI` 类表达方法签名。
> - 关键补强：`ProductCreateRequest/UpdateRequest` 增加 `tags`；`CategoryCreate/Update/ReorderReq`；`LoginVO` 增加 `expires_at`；`RefreshRequest`。

---

## 4. 调用流程（时序图）

> 完整 Mermaid 见同目录 `admin-ui-sequence-diagram.mermaid`。含 3 条流：
> 1. **登录鉴权流**：登录页 → `userStore.loginByUsername` → `PureHttp POST /api/v1/admin/login`（命中白名单不加 token）→ 后端 `services.login` → `LoginVO` → 映射 `setToken` → 后续请求自动带 `Authorization: Bearer`。
> 2. **典型产品 CRUD 流**：列表 `GET /admin/products` → 编辑 `GET /admin/products/{id}`（含 tags/galleries）→ 保存 `PUT /admin/products/{id}`（写 tags + clean_html + search_vector + `@audit` 写 `AuditLog`）。
> 3. **图片上传流**：`el-upload` → `POST /admin/upload`(multipart) → 后端写 `MEDIA_ROOT` + `UploadRecord` → 返回 `url:"/uploads/..."` → 绑定 `cover_image`/`gallery.image_url`。

---

## 5. 有序任务清单（T01..T09，按依赖与优先级）

> **组织说明**：本任务横跨前后端且需文件级交付，故任务数超过通用 5 上限；采用 **Phase 分组 + 连续编号**——`T01~T05` 为**第一轮切片（P0 + 3 缺口）**，`T06~T09` 为后续阶段（P1/P2）。每个任务源文件 ≥3，符合"分组不碎片化"原则。`T01` 为基础设施与对接（优先）。

### Phase 1 — 第一轮切片（P0 + 3 个后端缺口）
| ID | 任务名 | 优先级 | 依赖 | 源文件（≥3） |
|---|---|---|---|---|
| **T01** | 基础设施与对接层（前后端共享） | P0 | 无 | `vite.config.ts`、`src/api/user.ts`、`src/store/modules/user.ts`、`src/utils/auth.ts`、`content/schemas.py`、`content/routers.py`（+ `/admin/refresh`） |
| **T02** | 后端缺口①：分类写/排序 API | P0 | 无 | `product/routers.py`、`product/schemas.py`、`product/services.py`、`news/routers.py`、`news/schemas.py`、`news/services.py`、`content/permissions.py` |
| **T03** | 后端缺口②：图片上传 API | P0 | 无 | `uploads/routers.py`(新)、`uploads/services.py`(新)、`uploads/models.py`(新)、`main.py`、`common/config.py` |
| **T04** | 后端缺口③：后台按 ID 详情 + 产品 tags 写入 | P0 | 无 | `product/routers.py`、`product/schemas.py`、`product/services.py`、`news/routers.py`、`news/schemas.py`、`news/services.py` |
| **T05** | 前端业务模块（产品/新闻/分类三页 + 菜单与按钮权限接入） | P0 | T01,T02,T03,T04 | `src/api/{product,news,category}.ts`、`src/views/product/*`、`src/views/news/*`、`src/views/category/*`、`src/router/modules/{product,news,category}.ts` |

### Phase 2 — P1（后续阶段）
| ID | 任务名 | 优先级 | 依赖 | 源文件 |
|---|---|---|---|---|
| **T06** | 批量操作（批量上下架/删除）+ 图库批量上传增强 | P1 | T04,T05 | `product/routers.py`(批量端点)、`src/views/product/index.vue`、`src/api/product.ts` |
| **T07** | 上传组件封装（el-upload + 进度 + cropperjs 裁剪） | P1 | T03 | `src/components/Upload/ImageUpload.vue`、`src/views/product/edit.vue`(接入) |

### Phase 3 — P2（后续阶段）
| ID | 任务名 | 优先级 | 依赖 | 源文件 |
|---|---|---|---|---|
| **T08** | 审计日志页 + 角色/权限管理 UI | P2 | T01 | `src/views/system/audit.vue`、`src/views/system/role.vue`、`src/api/system.ts`、`src/router/modules/system.ts` |
| **T09** | 富文本编辑器集成（wangEditor）到产品/新闻内容编辑 | P2 | T05 | `src/views/product/edit.vue`、`src/views/news/edit.vue`、(可选 `src/components/Editor/RichText.vue`) |

### 任务依赖关系（简图）
```
T01 ──┬──> T05 ──> T06 ──> T07
T02 ──┤            └──────> T09
T03 ──┤
T04 ──┘
(T08 仅依赖 T01，后端接口已有)
```
> 第一轮切片可并行推进 T01~T04（彼此独立），T05 汇总联调；T06/T07/T08/T09 为后续阶段。

---

## 6. 依赖包

### 6.1 后端新增
| 包 | 用途 | 是否必须 |
|---|---|---|
| `python-multipart` | 解析 `multipart/form-data` 上传 | **必须** |
| `aiofiles` | 异步写文件（本地磁盘，可选；同步写亦可） | 可选 |

> 注：`UploadRecord` 模型需 `aerich migrate && aerich upgrade` 生成迁移；`config.tortoise_modules` 增加 `"uploads.models"`。

### 6.2 前端新增
| 包 | 用途 | 是否必须 |
|---|---|---|
| 无（全部复用已装） | `el-upload`(Element Plus)、`cropperjs`、`@wangeditor/*`、`vuedraggable`、`@vueuse/core` 均已存在 | — |

> 前端**零新依赖**，符合"复用脚手架"原则。

---

## 7. 共享约定（跨文件，前后端一致）

| 约定 | 值 / 规则 |
|---|---|
| **API 路径前缀** | 全部 `/api/v1`；写接口 `/api/v1/admin/*`；公开 `/api/v1/products` 等 |
| **鉴权 Header** | `Authorization: Bearer <access_token>`（`PureHttp` 自动附加；白名单 `endsWith("/login"｜"/refresh")` 免带） |
| **成功标识** | `Result.code === "0"`（字符串）；前端 `store` 比较用 `=== "0"` |
| **错误结构** | `Result{code, msg, msgI18n, data, traceId, timestamp}`；业务失败 `code` 如 `A010001`，客户端 `C401001/C403001` |
| **分页结构** | `PageResponse{ list, total, page, page_size }`；请求 `PageRequest{ page, page_size, order_by }` |
| **图片 URL 返回** | **相对路径** `{MEDIA_URL}/2026/xx.jpg`（如 `/uploads/2026/xx.jpg`），前端同源经 vite proxy 访问；切对象存储时返回完整 URL |
| **tags 约定** | `string[]`（如 `["OEM","4K","Waterproof"]`）；后端 `JSONField`，前端用 `el-select` 多标签或标签输入；空数组 `[]` 兜底 |
| **字段命名** | 后端蛇形（`access_token`）；前端驼峰（`accessToken`）——**仅在 `api/user.ts` 映射层转换，不污染其余代码** |
| **软删** | `deleted=1`；列表 `filter(deleted=0)`；删除即软删（与现状一致） |
| **审计** | 所有写接口加 `@audit(action, resource)`（best-effort） |
| **排序** | `sort_order` 整数；`/sort` 接收目标 `id[]` 顺序回写 |
| **权限码** | 页面级 `meta.roles`（匹配 `userInfo.roles`）；按钮级 `v-auth="product:delete"`（匹配 `userInfo.permissions`） |
| **刷新** | `POST /api/v1/admin/refresh` 收 `refresh_token` 返新 `LoginVO`；前端 `PureHttp` 过期自动无感刷新 |

---

## 8. 待明确事项（8 个开放问题 — 推荐默认 + 理由，供用户拍板）

| # | 问题 | 推荐默认 | 理由 |
|---|---|---|---|
| **1** | 默认管理员账号如何初始化 | **保留种子机制，密码支持环境变量覆盖**：`seed_on_start=True` 时若库无 `admin` 则创建；新增 `ADMIN_PASSWORD` 环境变量覆盖硬编码 `Songdian@2026` | 避免密码硬编码入库；生产可配；幂等 `get_or_create` 不破坏已有账号 |
| **2** | Token TTL 与是否需要 refresh | **启用 refresh**：access 2h / refresh 7d 不变；新增 `POST /api/v1/admin/refresh`；`LoginVO` 增加 `expires_at`（access 过期时间戳） | 2h 过期需无感刷新提升体验；后端已签发 refresh token 仅缺端点，成本低 |
| **3** | 分类扁平 vs 多级嵌套 | **扁平**（与现状一致：`sort_order`、无 `parent_id`、`CategoryTreeVO=CategoryVO` 已注释"单级"） | 当前产品/新闻分类均单级，多级是过度设计；后续加 `parent_id` 易扩展 |
| **4** | 删除用软删还是硬删 | **软删**（`deleted=1`，复用 `SoftDeleteMixin`） | 与产品/新闻一致；可恢复、审计友好；无需改 DDL |
| **5** | 图片存储：本地磁盘 vs 对象存储 | **第一轮切片用本地磁盘**（`backend/uploads`，复用 `StaticFiles` 挂载）；存储抽象为 `StorageBackend`，后续切 OSS/COS 仅改配置 + 实现 | 零额外依赖、复用现有挂载、可演进；对象存储需密钥/网络，留作后续 |
| **6** | 富文本编辑器选型（P2） | **直接用 wangEditor**（`@wangeditor/editor` + `editor-for-vue` 已装，`views/editor` 有示例） | 零新依赖，团队已有示例，避免引入新生态 |
| **7** | 前端 store/请求层是否复用脚手架约定 | **复用** `PureHttp` + `/src/api/*` + `pinia user store` + `router/modules` 自动菜单；仅加字段映射适配层 | 统一、低维护、符合 vue-pure-admin 约定，不另起炉灶 |
| **8** | 分类写接口归属模块 + 批量上传落库 | **分类写接口就地加在各自模块 router**（产品→`product/routers.py`，新闻→`news/routers.py`，不新建独立 router）；批量上传落 `ProductGallery.image_url` + `UploadRecord` 溯源 | 减少跨模块耦合；复用现有外键与图库模型，上传记录独立审计 |

> 另建议（非阻塞）：是否将 `operator` 角色默认授予 `media:upload`/`category:*`/`news:category:*`（设计已默认授予，见 `content/permissions.py` 改动）。

---

## 9. 第一轮切片范围总结（交付承诺）

**第一轮切片 = Phase 1 = T01~T05**，完成后即可交付：
- 真实登录 + 无感刷新（T01）
- 分类增删改 + 拖拽排序（T02）
- 图片上传（单/批）（T03）
- 后台按 ID 编辑产品/新闻 + 产品 tags 可编辑（T04）
- 产品/新闻/分类三个管理页面 + 侧边菜单 + 按钮级权限（T05）

**P1**（T06/T07）：批量上下架/删除、上传组件封装（进度+裁剪）。
**P2**（T08/T09）：审计日志页、角色/权限管理 UI、富文本编辑器集成。

---

> 附：两张 Mermaid 图已落盘——`admin-ui-class-diagram.mermaid`（类图）、`admin-ui-sequence-diagram.mermaid`（时序图）。
