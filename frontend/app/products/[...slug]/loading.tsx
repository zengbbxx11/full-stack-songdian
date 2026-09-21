/**
 * 骨架屏：顺序与断点必须与页面产品概览区一致，否则导航到本路由时会跳版。
 * 页面移动端顺序 = 型号 → 图集 → 按钮（并排一行）→ 简介要点 → OEM 说明，
 * 桌面端 = 图集居左、信息栏居右（整栏 sticky）。改 page.tsx 概览区时请同步这里。
 */
export default function ProductDetailLoading() {
  return (
    <div role="status" aria-label="Loading product">
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-5" aria-hidden="true">
        <div className="site-container"><div className="h-10 w-3/4 rounded-full skeleton" /></div>
      </section>
      <section className="bg-white py-8 md:py-16" aria-hidden="true">
        <div className="site-container">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div className="max-lg:contents lg:order-2 lg:sticky lg:top-28 lg:self-start">
              {/* 块 1：型号区 */}
              <div className="order-1">
                <div className="mb-4 h-4 w-28 rounded skeleton" />
                <div className="mb-6 h-12 w-3/4 rounded skeleton md:h-16" />
                <div className="mb-5 h-4 w-32 rounded skeleton" />
              </div>
              {/* 块 3：按钮行 → 简介要点 → OEM 说明 */}
              <div className="order-3 flex flex-col">
                <div className="order-1 mb-8 flex flex-nowrap items-stretch gap-2 lg:order-2 lg:flex-wrap lg:gap-3">
                  <div className="skeleton h-12 w-36 shrink-0 rounded-2xl lg:w-44" />
                  <div className="skeleton h-12 min-w-0 flex-1 rounded-xl lg:h-11 lg:w-56 lg:flex-none" />
                </div>
                <div className="order-2 mb-7 space-y-2.5 lg:order-1">
                  {[0, 1, 2].map(i => <div key={i} className="skeleton h-4 w-3/4 rounded" />)}
                </div>
                <div className="skeleton order-3 h-20 rounded-2xl" />
              </div>
            </div>
            {/* 图集（移动端夹在型号与按钮之间；主图限高与页面一致，缩略图条同样叠加在主图底部） */}
            <div className="order-2 lg:order-1">
              <div className="max-sm:flex-row-reverse flex flex-col-reverse gap-3 sm:flex-row md:gap-4">
                <div className="max-sm:w-14 max-sm:flex-col max-sm:snap-none max-sm:overflow-visible max-sm:pb-0 flex shrink-0 gap-2 sm:w-16 sm:flex-col md:w-20">
                  {[0, 1, 2, 3].map(i => <div key={i} className="skeleton max-sm:h-14 max-sm:w-14 h-16 w-16 shrink-0 rounded-lg md:h-20 md:w-20" />)}
                </div>
                <div className="skeleton aspect-square self-center rounded-2xl max-sm:h-[260px] sm:max-lg:h-[300px]" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
