/**
 * 新闻列表页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配新闻网格布局，在文章数据获取期间展示。
 */
export default function NewsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
      {/* 标题骨架 */}
      <div className="mb-10">
        <div className="h-3 w-20 rounded animate-pulse bg-[#E5E5E5] mb-3" />
        <div className="h-8 w-48 rounded animate-pulse bg-[#E5E5E5]" style={{ animationDelay: "0.05s" }} />
      </div>

      {/* 置顶卡片骨架 */}
      <div className="mb-10">
        <div
          className="aspect-[21/9] rounded-xl animate-pulse bg-[#F4F4F4]"
        />
      </div>

      {/* 新闻网格骨架 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div
              className="aspect-[16/10] rounded-xl animate-pulse bg-[#F4F4F4]"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
            <div
              className="h-4 w-1/4 rounded animate-pulse bg-[#E5E5E5]"
              style={{ animationDelay: `${i * 0.08 + 0.04}s` }}
            />
            <div
              className="h-5 w-3/4 rounded animate-pulse bg-[#E5E5E5]"
              style={{ animationDelay: `${i * 0.08 + 0.06}s` }}
            />
            <div
              className="h-3 w-full rounded animate-pulse bg-[#F4F4F4]"
              style={{ animationDelay: `${i * 0.08 + 0.08}s` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
