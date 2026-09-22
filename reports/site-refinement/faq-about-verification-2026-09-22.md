# FAQ / About 页头优化验收

- 预览地址：http://localhost:3000。沿用用户已启动的开发服务。
- FAQ：原标题拆为小字号 Camera OEM & ODM 与主标题 FAQ，仍保留一个完整 H1；细红线、分隔线与响应式留白。
- About：Who We Are 和主标题独立成页头，公司介绍与数据从同一行开始；保留文案与模块。
- 共用 CSS，未新增依赖、未修改接口或后台。
- 全前端 ESLint 通过；生产 build 通过，含 TypeScript 检查；SEO/GEO 脚本通过；局部 diff 格式检查通过。
- 两页在 320 / 390 / 768 / 1440px 下等待正文可见后检查，无横向溢出。
- FAQ 鼠标展开及 Enter 键折叠检查通过；浏览器未捕获 pageerror。
- 最终截图：heading-faq-390.png、heading-faq-1440.png、heading-about-390.png、heading-about-1440.png。
- 本轮未执行全量端到端测试或 Lighthouse 评分。
