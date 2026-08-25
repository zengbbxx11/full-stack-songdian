/**
 * 新闻列表页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配新闻网格布局，在文章数据获取期间展示。
 */
export default function NewsLoading() {
  return (
    <>
      <section className="bg-[#171A20] py-5"><div className="site-container"><div className="skeleton h-8 w-28 rounded-full bg-white/10" /></div></section>
      <section className="bg-white py-12 md:py-16"><div className="site-container">
        <div className="mb-10 grid min-h-[320px] overflow-hidden rounded-xl bg-[#F4F4F4] md:grid-cols-2">
          <div className="skeleton aspect-[4/3] md:aspect-auto" />
          <div className="flex flex-col justify-center space-y-4 p-8 md:p-10">
            <div className="skeleton h-4 w-32 rounded" /><div className="skeleton h-7 w-4/5 rounded" />
            <div className="skeleton h-4 w-full rounded" /><div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid min-h-36 grid-cols-[38%_1fr] overflow-hidden rounded-xl border border-[#EEEEEE]">
              <div className="skeleton" />
              <div className="space-y-3 p-5"><div className="skeleton h-3 w-1/3 rounded" /><div className="skeleton h-5 w-4/5 rounded" /><div className="skeleton h-3 w-full rounded" /></div>
            </div>
          ))}
        </div>
      </div></section>
    </>
  );
}
