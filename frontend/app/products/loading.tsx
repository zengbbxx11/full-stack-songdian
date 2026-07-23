/**
 * 产品列表页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配产品网格布局（2/3/4 列响应式），在产品数据获取期间展示。
 */
export default function ProductsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
      {/* 标题骨架 */}
      <div className="mb-10">
        <div className="h-3 w-20 rounded animate-pulse bg-[#E5E5E5] mb-3" />
        <div className="h-8 w-48 rounded animate-pulse bg-[#E5E5E5]" style={{ animationDelay: "0.05s" }} />
      </div>

      {/* 分类筛选骨架 */}
      <div className="flex flex-wrap gap-2 mb-10">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-[34px] rounded-full animate-pulse bg-[#F4F4F4]"
            style={{ width: `${70 + i * 15}px`, animationDelay: `${i * 0.06}s` }}
          />
        ))}
      </div>

      {/* 产品网格骨架 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div
              className="aspect-[3/4] rounded-xl animate-pulse bg-[#F4F4F4]"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
            <div
              className="h-4 w-3/4 rounded animate-pulse bg-[#E5E5E5]"
              style={{ animationDelay: `${i * 0.08 + 0.04}s` }}
            />
            <div
              className="h-3 w-1/2 rounded animate-pulse bg-[#F4F4F4]"
              style={{ animationDelay: `${i * 0.08 + 0.08}s` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
