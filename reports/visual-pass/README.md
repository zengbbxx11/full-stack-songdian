# 局部视觉优化验收

本轮仅调整 frontend/app/products/page.tsx、components/ProductCard.tsx、app/page.tsx、components/motion/AnimatedSection.tsx、app/globals.css。保留页面原有内容、文案、品牌色、首页深色卡片及产品方形图片比例，没有新增依赖。

- 产品页：筛选面板减轻阴影与留白；平板标题和数量并排、小屏数量横向排列；分页允许换行。
- 产品卡片：分类文字对比度与字号微调；键盘 focus 与 hover 同等反馈；箭头默认可见；限制过渡属性；复用原 object-contain。
- 首页：保留原产品卡片形式，补齐键盘展开及宽屏触屏说明展示，移除图片永久 will-change。
- 区块：小屏区块间距收紧；CSS view timeline 渐进式入场，14px 轻位移，不增加客户端组件或运行时；不支持时直接正常展示，减少动态效果时关闭。
- 性能：产品页与共享卡片显式关闭链接预取，修正图片 sizes 的断点边界。

验证：ESLint、TypeScript、生产 build 均通过；首页布局/API 映射共 10 条测试通过；SEO 检查通过。首页/产品页 320、390、768、1024、1440 宽度无横向溢出，浏览器无 pageerror。减少动态效果下动画名为 none。

截图文件为 home/products 的 390 与 1440 宽度。预览 http://localhost:3102 使用开发模式的现有 ALLOW_LOCAL_IMAGE_OPTIMIZATION 开关展示本地真实产品图，生产配置未放宽。未执行新一轮全量后端测试或 Lighthouse，本轮未修改后端。
