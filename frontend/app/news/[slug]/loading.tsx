/**
 * 新闻详情页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配文章详情页的单栏布局，在内容数据获取期间展示。
 */
export default function NewsDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-20">
      {/* 分类/日期骨架 */}
      <div className="flex gap-3 mb-4">
        <div className="h-3 w-16 rounded animate-pulse bg-[#E5E5E5]" />
        <div className="h-3 w-24 rounded animate-pulse bg-[#F4F4F4]" />
      </div>

      {/* 标题骨架 */}
      <div className="space-y-3 mb-8">
        <div className="h-8 w-full rounded animate-pulse bg-[#F4F4F4]" />
        <div className="h-8 w-2/3 rounded animate-pulse bg-[#F4F4F4]" style={{ animationDelay: "0.05s" }} />
      </div>

      {/* 作者/日期骨架 */}
      <div className="flex gap-4 mb-10 pb-8 border-b border-[#EEEEEE]">
        <div className="h-4 w-24 rounded animate-pulse bg-[#E5E5E5]" />
        <div className="h-4 w-32 rounded animate-pulse bg-[#F4F4F4]" />
      </div>

      {/* 内容骨架 — 多个段落 */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded animate-pulse bg-[#F4F4F4]"
            style={{
              width: `${85 - Math.random() * 30}%`,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
