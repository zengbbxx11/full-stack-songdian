# Songdian 官网视觉与交互规范

> 当前版本：2026-08-13。本文以 `frontend/` 当前代码为准，名称保留是为了兼容既有引用；“Tesla”只表示克制、产品优先的设计灵感，不代表复制 Tesla 品牌、字体或内容。
>
> 系统部署、SEO、缓存、API 和发布流程请以 [`CURRENT_IMPLEMENTATION.md`](../CURRENT_IMPLEMENTATION.md) 与根目录 [`deploy-guide.md`](../deploy-guide.md) 为准。

## 1. 设计目标

Songdian 官网面向全球 OEM/ODM 数码相机采购商。视觉应当现代、可信、克制，并把用户从制造能力、产品范围和质量证明自然引导至询盘。

核心原则：

- 产品图片和工厂视频是主要视觉内容，UI 负责建立层级和行动路径。
- 使用黑、白、浅灰和品牌红建立稳定的品牌识别；蓝色仅保留给少量工具状态。
- 卡片、筛选栏、图片、详情面板和浮层使用适度圆角，不使用过度装饰。
- 首屏优先保证加载、可读性和 CTA 可见性；动效必须支持内容理解，并尊重 `prefers-reduced-motion`。
- 桌面和 390px 手机视口都不能出现横向溢出或被固定浮层遮挡。

## 2. 颜色 Token

以下值来自 `frontend/app/globals.css` 和当前组件实现：

| 角色 | 值 | 使用场景 |
|---|---|---|
| Brand Red / Primary | `#d4343e` | 询盘、报价、联系、导航激活、焦点状态 |
| Brand Red Hover | `#b91c1c` | 品牌红按钮悬停 |
| Carbon Dark | `#171A20` | 标题、主导航、主要正文 |
| Surface Dark | `#111316` | 深色 Hero、数据带和视频占位 |
| Graphite | `#393C41` | 次级正文 |
| Pewter | `#5C5E62` | 辅助文字、说明文字 |
| Cloud Gray | `#EEEEEE` | 分隔线、输入框边框 |
| Light Ash | `#F4F4F4` | 次级背景、筛选未选中态 |
| Soft Surface | `#f5f6f7` | 面包屑当前项、浅色面板 |
| Electric Blue | `#3E6AE1` | 仅在确有工具语义时使用，例如搜索或分页 |

颜色按语义使用：品牌红表示“联系/转化”，中性灰表示结构和信息，蓝色不应与红色 CTA 混用成同一角色。

## 3. 字体与层级

实际字体由 Geist 与系统无衬线字体提供，不依赖 Universal Sans 或 Gotham：

```css
font-family: var(--font-geist-sans), Arial, Helvetica, system-ui, sans-serif;
```

建议层级：

| 内容 | 桌面 | 手机 | 说明 |
|---|---:|---:|---|
| 页面/Section 标题 | `clamp(2rem, 4vw, 3.75rem)` | 随 viewport 缩放 | 使用紧凑行高和轻微负字距 |
| 产品内页 Hero 标题 | 约 56–72px | 36–44px | 保持压缩 Hero，不追求满屏高度 |
| 正文 | 16–18px | 15–16px | 行高约 1.6–1.75 |
| 导航 | 15px | 15–16px | 保证触摸可读性 |
| 辅助标签 | 11–13px | 11–13px | 可使用大写和字距表达分类 |

避免为了“极简”把导航、筛选项或表单说明缩得过小。可访问性优先于装饰性留白。

## 4. 圆角、边框与阴影

圆角 Token 定义于 `globals.css`：

| Token | 值 | 适用场景 |
|---|---:|---|
| `--radius-sm` | 6px | 小控件、标签 |
| `--radius-md` | 10px | 按钮、输入框、筛选项 |
| `--radius-lg` | 12px | 卡片、常规面板 |
| `--radius-xl` | 16px | 图片、视频、较大内容容器 |
| `--radius-2xl` | 20px | Hero 或重点面板 |
| `--radius-3xl` | 24px | 大型内容组合 |
| `--radius-4xl` | 28px | 特殊大容器 |

使用 1px 浅色边框建立层级；阴影只用于浮层、底部询盘栏、视频卡片等需要脱离页面的元素。不要给所有卡片添加厚重阴影。

## 5. 页面结构

### Header

- 桌面端保留 Logo、主导航和主要询盘 CTA；导航字体不低于 15px。
- 移动端使用折叠菜单，菜单项应保持足够的点击高度。
- 当前页面或悬停状态使用品牌红，避免同时使用多种激活颜色。

### Breadcrumbs

`components/Breadcrumbs.tsx` 使用胶囊式容器、Home 图标、Chevron 分隔符和 `aria-current="page"`。面包屑应保持紧凑，不重复 Hero 标题，也不在移动端撑开页面宽度。

### 产品列表

`/products` 需要保持以下信息顺序：

1. 面包屑
2. 紧凑的产品 Hero（H1、说明、产品数量）
3. `Browse by category` 筛选栏（当前状态、分类入口和结果数）
4. 产品网格

筛选项使用白/浅灰底、灰色边框，悬停和激活使用品牌红；不要把整个筛选区做成大块高饱和色面板。

### 产品详情

重点信息按“图片/型号 → 关键规格 → OEM/ODM 能力 → 采购询盘”组织。Send Inquiry 必须带上当前产品 slug（`/contact?product=<slug>`），不要让采购商重新输入产品型号。

### Contact 与浮层

- 联系页显示完整询盘表单和地图，地图容器必须限制在父容器宽度内。
- `FloatingInquiry` 是全宽底部栏，文案为 “Discuss your camera project”，在联系页隐藏。
- Cookie 同意横幅出现时，浮动询盘栏必须隐藏或避让；不能同时遮挡底部 CTA。

### Footer

使用浅灰/白色背景、深色文字、品牌红交互色和原始黑红 Logo。不要使用纯黑页脚，以免与 Logo 中的黑色字标失去对比。

## 6. 图片与视频

- 产品图片使用 `ProductGallery` 和统一的 `object-fit` 规则，图片容器保持稳定比例，避免布局跳动。
- 工厂视频组件为 `components/FactoryVideo.tsx`，点击后才播放，使用 `preload="metadata"`、`playsInline` 和 `controls`。
- 当前视频资产为 `frontend/public/Video/SongdianFactoryVideo.mp4`，首页与 About 页面均可展示。它是静态前端源码资产，不等同于生产运行时上传媒体。
- 视频、图片和地图都必须在 390px 视口下检查，不得造成横向滚动。

## 7. 动效与可访问性

- 使用短时长、低幅度的 opacity/translate 动效；`prefers-reduced-motion: reduce` 时直接显示内容。
- 所有图标按钮必须有可读的 `aria-label`；当前页链接使用 `aria-current`。
- 键盘焦点使用全局 `:focus-visible` 焦点环；页面提供 skip-link。
- 不使用自动播放工厂视频，不把重要信息只放在 hover 状态。

## 8. 响应式验收清单

至少检查 1440px 桌面和 390px 手机：

- 页面 `scrollWidth` 不超过视口宽度。
- Header、筛选栏、面包屑和产品卡片没有文字溢出。
- 产品 Hero 与 `Browse by category` 间距紧凑，首屏能看到有效内容。
- 联系页地图、询盘表单和固定底栏不会互相遮挡。
- 视频封面、播放按钮和控制条可以正常使用。
- 导航、按钮和筛选项具备足够的触摸区域。

## 9. 实现索引

| 功能 | 主要文件 |
|---|---|
| 全局颜色、字体、圆角 | `frontend/app/globals.css` |
| Header / Footer | `frontend/components/Header.tsx` / `Footer.tsx` |
| 面包屑 | `frontend/components/Breadcrumbs.tsx` |
| 产品列表与筛选 | `frontend/app/products/page.tsx` |
| 产品详情 | `frontend/app/products/[...slug]/page.tsx` |
| 工厂视频 | `frontend/components/FactoryVideo.tsx` |
| 浮动询盘 | `frontend/components/FloatingInquiry.tsx` |
| Cookie 同意 | `frontend/components/CookieConsent.tsx` |
| SEO 结构化数据 | `frontend/lib/seo.ts` |

修改视觉样式后，至少执行 `npm.cmd run lint`、`npm.cmd run build`，并回归桌面端与 390px 移动端页面。
