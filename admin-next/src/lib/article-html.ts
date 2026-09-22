/*
 * 文章正文的「预览清洗」与「预览文档构建」
 * ------------------------------------------------------------------
 * 用途单一：管理后台新闻正文编辑器的右侧预览。
 *
 * 1) 清洗（保真）
 *    白名单取「后端 clean_html（bleach）∩ 官网 frontend/lib/html-cleaner.ts（sanitize-html）」
 *    的**交集** —— 只有同时通过这两层的东西才真正出现在官网上，因此预览按交集走，
 *    不会出现「预览里显示、保存后却没了」的误导：
 *    - 去掉官网有、后端没有的：video / source / section / tfoot / caption / colgroup / col、
 *      td 与 th 的 colspan/rowspan（后端 ALLOWED_ATTRIBUTES 不含，入库即剥）；
 *    - 去掉后端有、官网没有的：abbr；
 *    - 属性同样取交集：a 收敛为 href/target/rel，img 收敛为 src/alt/title/width/height
 *      （去掉官网的 loading/decoding），`*` 只留 class（去掉官网的 id —— 后端不保留 id，
 *      锚点入库后本就失效）。
 *    语义：白名单外的标签剥离标签、**保留文本与合法子节点**（`<foo>bar</foo>` → `bar`），
 *    与后端 bleach `strip=True` 一致；`script`/`style`/`textarea`/`option` 属 sanitize-html 的
 *    nonTextTags，内容整体丢弃（实测 `<script>x</script>` → 空串）。
 *    仍保留的有意差异：不做官网那 10 步 WP/Astra 历史内容清理（去容器、去空段）；不把
 *    `/uploads/...` 改写成绝对地址（预览与后台同源，admin-next 的 next.config.ts 已把
 *    /uploads 代理到后端）；不注入 loading/decoding、首图 eager 等只在官网运行期追加的属性。
 *
 * 2) 渲染（安全）
 *    **本文件不是安全边界，不要拿它当防线**。真正的边界是渲染方式：预览渲染在
 *    <iframe sandbox="">（无 allow-scripts、无 allow-same-origin）里 —— 即使这里的
 *    清洗被绕过（mXSS 之类的绕过是自研/正则清洗的高发区），脚本也无法执行，
 *    iframe 也无法触碰后台页面的 DOM 与管理员会话。保存链路的权威清洗仍在后端
 *    clean_html（bleach 白名单）。
 */
import sanitizeHtml from "sanitize-html";

// 后端 bleach 与官网 sanitize-html 两份白名单的交集（见文件头：只预览「能真正落到官网上」的内容）。
const PREVIEW_WHITELIST: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "ul", "ol", "li", "blockquote",
    "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "small", "sup", "sub", "code", "pre",
    "hr", "br", "div", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class"],
  },
  // 仅允许安全协议，拦截 javascript:/data:/vbscript: 协议注入
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // 外链 target=_blank 自动补 rel，防 reverse tabnabbing（与官网 transformTags 同规则）
  transformTags: {
    a: (tagName, attribs) =>
      attribs.target === "_blank"
        ? { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
        : { tagName, attribs },
  },
};

/** 按（后端 ∩ 官网）白名单清洗正文 HTML；结果只用于预览渲染。 */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, PREVIEW_WHITELIST);
}

// 预览排版：取自 frontend/app/globals.css 的 .article-body 关键规则（非全量，
// 目标是"看得出官网的版式"，不是像素级复刻）。
const PREVIEW_STYLE = `
:root { --accent: #3E6AE1; --ink: #393C41; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px 18px; background: #fff; color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  font-size: 16px; line-height: 1.75; word-break: break-word; }
.article-body > :first-child { margin-top: 0; }
.article-body h1, .article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6 {
  font-weight: 500; color: #171A20; margin: 1em 0 0.75em; line-height: 1.2; }
.article-body h1 { font-size: 1.5rem; }
.article-body h2 { font-size: 1.25rem; border-bottom: 1px solid #EEEEEE; padding-bottom: 6px; }
.article-body h3 { font-size: 1.125rem; border-bottom: 1px solid #EEEEEE; padding-bottom: 6px; }
.article-body h4 { font-size: 1rem; }
.article-body p { margin: 0 0 1.25em; color: var(--ink); }
.article-body a { color: var(--accent); text-decoration: none; font-weight: 500; }
.article-body a:hover { text-decoration: underline; text-underline-offset: 4px; }
.article-body img { border-radius: 12px; max-width: 100%; height: auto; margin: 1.5em 0; }
.article-body figure { margin: 2em 0; text-align: center; }
.article-body figure img { margin: 0; }
.article-body figcaption { margin-top: 0.75em; font-size: 14px; color: #8E8E8E; }
.article-body ul, .article-body ol { margin: 1.25em 0; padding-left: 1.5em; }
.article-body ul { list-style-type: disc; }
.article-body ol { list-style-type: decimal; }
.article-body li { margin-bottom: 0.5em; }
.article-body blockquote { border-left: 3px solid #EEEEEE; padding: 1em 0 1em 1.5em; margin: 1.5em 0;
  font-style: italic; color: #5C5E62; background: #F4F4F4; border-radius: 0 12px 12px 0; }
.article-body pre { background: #F4F4F4; border-radius: 12px; padding: 1.25em; overflow-x: auto; font-size: 13px; }
.article-body code { background: #F4F4F4; border-radius: 4px; padding: 0.15em 0.35em; font-size: 0.9em; }
.article-body pre code { background: none; padding: 0; }
.article-body hr { border: 0; border-top: 1px solid #EEEEEE; margin: 2em 0; }
.article-body table { width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 14px; }
.article-body th, .article-body td { border: 1px solid #E5E7EB; padding: 8px 12px; text-align: left; }
.article-body th { background: #F9FAFB; font-weight: 600; }
.article-body mark { background: #FFF3C4; }
.preview-empty { color: #9CA3AF; font-size: 13px; }
`;

/** 只接受规范 http(s) 源，避免把非法字符拼进 CSP；不符合时退化为 'self'。 */
function safeOrigin(origin: string): string {
  return /^https?:\/\/[a-zA-Z0-9.\-]+(?::\d+)?$/.test(origin) ? origin : "'self'";
}

/**
 * 构建预览文档：清洗正文 → 包进带 CSP 的完整 HTML 文档，供 <iframe sandbox=""> 的 srcDoc 使用。
 *
 * CSP 说明：
 * - 沙箱 iframe 里的文档是**不透明源**，`'self'` 不再等于后台页面的源，因此图片源要用运行时
 *   origin 显式写出来（相对路径 /uploads/... 仍按父文档地址解析）。
 * - `img-src` **只放后台自身 origin 与 `data:`**，不放开外链 `https:`：若正文里出现
 *   `<img src="https://第三方/...">`，放开会让后台浏览器直接请求第三方，成为可用的外发信标
 *   （沙箱只限制脚本与 DOM 能力，不限制图片 GET）。代价是外链图在预览里显示不出来（官网仍正常
 *   显示），这是有意的「安全优先于保真」取舍；确实需要外链图时应改成显式域名白名单。
 */
export function buildPreviewDocument(html: string, origin: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${safeOrigin(origin)} data:`,
    "style-src 'unsafe-inline'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  const body = sanitizeArticleHtml(html);
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="referrer" content="no-referrer">',
    "<style>",
    PREVIEW_STYLE,
    "</style>",
    "</head>",
    "<body>",
    `<div class="article-body">${body || '<p class="preview-empty">左侧输入 HTML 代码后，这里会实时显示清洗后的效果。</p>'}</div>`,
    "</body>",
    "</html>",
  ].join("");
}
