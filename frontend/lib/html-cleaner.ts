/**
 * cleanPostContent — 清洗文章 HTML，确保格式统一
 * ------------------------------------------------------------------
 * 从任意来源（WP 迁移、富文本编辑器、手动粘贴）的 HTML 中剥离
 * 所有内联样式、冗余容器、非标准类名，只保留语义化标签。
 * 清洗后的 HTML 由 .article-body CSS 统一排版。
 */

import sanitizeHtml from "sanitize-html";

// sanitize-html 白名单：只允许文章内容所需的安全标签与属性。
// script/iframe/object 等危险标签、on* 事件属性、javascript:/data: 协议一律被移除（防存储型 XSS）。
const ARTICLE_WHITELIST: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "ul", "ol", "li", "blockquote",
    "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "strong", "b", "em", "i", "u", "s", "mark", "small", "sup", "sub", "code", "pre",
    "hr", "br", "div", "span", "section", "video", "source",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    video: ["src", "controls", "poster", "width", "height"],
    source: ["src", "type"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    // 保留 class（.article-body 依赖 alignleft/wp-block-gallery 等类名排版）
    "*": ["class", "id"],
  },
  // 仅允许安全协议，拦截 javascript:/data:/vbscript: 协议注入
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // 外链 target=_blank 自动补 rel="noopener noreferrer"，防 reverse tabnabbing
  transformTags: {
    a: (tagName, attribs) =>
      attribs.target === "_blank"
        ? { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
        : { tagName, attribs },
  },
};

/**
 * 清洗所有来源 HTML，确保格式统一
 * - 剥离所有内联 style 属性（格式由 .article-body CSS 接管）
 * - 移除 Word/WP 注入的容器、类名、宽高约束
 * - 移除空段落与 HTML 注释
 */
export function cleanPostContent(html: string): string {
  let cleaned = html;

  // 1. 移除 Astra/WP 主题注入的文章元信息块
  //    包括发布日期、作者、分类等信息行
  cleaned = cleaned.replace(
    /<(?:div|p|span)[^>]*class="[^"]*(?:post-meta|entry-meta|ast-post-meta|posted-on|byline|entry-date|post-info|entry-info)[^"]*"[^>]*>[\s\S]*?<\/(?:div|p|span)>/gi,
    ""
  );

  // 2. 移除 Astra 容器包装：<div class="ast-container">...</div>
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*ast-container[^"]*"[^>]*>/gi,
    ""
  );

  // 3. 剥离所有标签上的内联 style 属性（核心规则 — 必须在 width 剥离之前执行）
  //    必须在 width 剥离之前运行：width 正则可能吞噬 style="..." 的闭合引号，
  //    导致后续 style 剥离正则匹配失败。先清掉整段 style="..."，再清残余 width。
  cleaned = cleaned.replace(/\s+style\s*=\s*"[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+style\s*=\s*'[^']*'/gi, "");

  // 4. 清除内联 width / max-width 样式（残留的独立 width 声明）
  cleaned = cleaned.replace(
    /\s*(?:max-)?width\s*:\s*[^;"]+[;"]?/gi,
    ""
  );

  // 4. 移除 alignwide / alignfull 等 Astra 布局类
  cleaned = cleaned.replace(
    /\b(?:alignwide|alignfull|has-text-align-center|has-background|has-\w+-background-color)\b/gi,
    ""
  );

  // 5. 将 Astra 的 wp-block-cover 等特殊块简化为普通 div
  cleaned = cleaned.replace(
    /<div[^>]*class="[^"]*wp-block-cover[^"]*"[^>]*>/gi,
    '<div class="wp-block-cover">'
  );

  // 6. 移除空的 class 属性
  cleaned = cleaned.replace(/\s+class="\s*"/g, "");
  cleaned = cleaned.replace(/\s+class='\s*'/g, "");

  // 7. 移除 Astra 注入的 <style> 标签
  cleaned = cleaned.replace(
    /<style[^>]*>[\s\S]*?<\/style>/gi,
    ""
  );

  // 8. 移除残留的空 div（配对的 </div></div> 合并为单个）
  cleaned = cleaned.replace(/<div>\s*<\/div>/g, "");

  // 9. 移除 HTML 注释（WP/Astra 注入的不可见标注，如 <!-- BODY CONTENT STARTS -->、<!--more-->）
  //    这些注释对用户不可见，但常残留在空 <p> 内形成无意义占位段，带来额外间距
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // 10. 移除清洗后仅剩空白的空段落/块（消除正文开头的无意义占位段，
  //     避免其 margin 在图片与正文间制造额外空白）
  cleaned = cleaned.replace(/<(p|div|span)[^>]*>\s*<\/\1>/gi, "");
  cleaned = cleaned.replace(/<(p|div|span)[^>]*>\s*<\/\1>/gi, "");

  // 最后做白名单安全消毒：移除危险标签 / on* 事件属性 / 不安全协议（防存储型 XSS）
  return sanitizeHtml(cleaned, ARTICLE_WHITELIST);
}
