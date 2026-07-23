/**
 * cleanPostContent — 清洗 WordPress 文章 HTML
 * ------------------------------------------------------------------
 * Astra 等 WP 主题会在 REST API 返回的 HTML 中注入大量容器类名、
 * 内联样式、宽度约束等，与 Next.js 的 Tailwind 排版冲突。
 * 此函数移除这些干扰元素，保留纯内容标记。
 */

/**
 * 清洗 Astra 主题注入的 HTML 结构
 * - 移除 ast-container 等包装 div
 * - 清除内联 width/max-width 样式
 * - 移除空的 span/div 包装
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

  // 3. 清除内联 width / max-width 样式（Astra 常设固定像素宽度）
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

  return cleaned;
}
