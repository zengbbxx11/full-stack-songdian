/**
 * 产品列表页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配产品网格布局（2/3/4 列响应式），在产品数据获取期间展示。
 */
export default function ProductsLoading() {
  return (
    <>
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-3">
        <div className="site-container"><div className="skeleton h-8 w-40 rounded-full bg-white/10" /></div>
      </section>
      <section className="bg-[var(--surface-dark)] pb-7 pt-4 md:pb-8 md:pt-5">
        <div className="site-container">
          <div className="skeleton h-3 w-28 rounded bg-white/10" />
          <div className="skeleton mt-3 h-12 w-72 max-w-full rounded bg-white/10" />
          <div className="skeleton mt-4 h-4 w-[32rem] max-w-full rounded bg-white/10" />
        </div>
      </section>
      <section className="bg-[var(--surface-soft)] pb-16 pt-8 md:pb-20 md:pt-10">
        <div className="site-container">
          <div className="mb-10 overflow-hidden rounded-3xl border border-black/[0.07] bg-white">
            <div className="border-b border-black/[0.06] px-5 py-4 md:px-6">
              <div className="skeleton h-5 w-44 rounded" />
              <div className="skeleton mt-2 h-3 w-64 max-w-full rounded" />
            </div>
            <div className="flex gap-2 overflow-hidden px-5 py-5 md:px-6">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-11 w-32 shrink-0 rounded-full" />)}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-black/8 bg-white">
                <div className="skeleton aspect-[4/3] md:aspect-square" />
                <div className="space-y-3 p-4 md:p-5">
                  <div className="skeleton h-3 w-2/5 rounded" />
                  <div className="skeleton h-5 w-3/4 rounded" />
                  <div className="skeleton h-11 w-28 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
