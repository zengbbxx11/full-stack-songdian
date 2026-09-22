# Contact 改版完整验证（2026-09-22）

## 结论
Contact 相关检查通过，但整套端到端验证尚非全绿。

## 已通过
- 官网 ESLint、TypeScript、生产 build、SEO/GEO 脚本。
- 管理后台 ESLint、TypeScript、生产 build。
- 后端 Ruff、pytest：173 passed，6 条依赖弃用警告。
- Contact：320/390/768/1024/1440px 均无水平溢出，未捕获 pageerror；空提交展示 4 个无效字段；已有询盘重试、去重、键盘选择用例通过。
- Google 链接为原始坐标 22.75499,113.28204，与高德 View 的 WGS-84 输入一致；未验证真实道路入口或导航路径。
- 地图按需加载用例通过。

## E2E 结果
- 全套首轮：117 条，112 passed / 5 failed。
- 排除 1 条 visitor submits an inquiry and it appears in admin：真实后台提交可能发送邮件，且原用例没有清理询盘；其余测试正常执行。
- 相关套件串行复测：24 条，21 passed / 3 failed。
- 首页轮播 1024px 首轮超时，串行复测通过，保留为潜在时序不稳定项。

## 本次发现并修复
首页 NewsGrid 图片 sizes 未匹配新的主次布局，宽屏实际约 669px 却选取 1280px 资源。更新手机、平板、桌面声明并限定容器上限，复测选取 768px，图片预算用例通过。未修改业务逻辑。

## 持续失败（未通过修改断言掩盖）
1. list-query-seo：新建产品分类的重复 category 参数用例，标题显示 Camera Products 而不是新分类。
2. list-query-seo：新建新闻分类的重复 category 参数用例，标题显示默认标题而不是新分类。
3. public-quality：发布新闻后立即读取 sitemap，未找到该新文章。
这些失败在串行复测中仍存在。现有实现有后台异步缓存刷新，运行日志包含刷新 200；刷新完成时机、类别缓存及读取一致性需要进一步单独定位，尚不能断言全部属于测试问题。

## 范围限制
未运行 Lighthouse 评分，未实际发送询盘或邮件，未验证 Google 地图实地落点。没有更改本地开发服务配置。

## 文件
- contact-full-e2e.json：首轮机器报告。
- contact-rerun-e2e.json：相关套件复测报告。
- contact-browser-check.json：Contact 响应式及链接结果。
- contact-final-390.png / contact-final-1440.png：页面截图。
