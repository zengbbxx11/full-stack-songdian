/**
 * 产品详情页加载骨架屏（兼容路由 /products/[...slug]）
 * ------------------------------------------------------------------
 * 在 getProductBySlug + getProducts 数据获取期间展示，
 * 匹配产品详情页的两栏布局，避免页面跳变。
 */
export default function ProductDetailLoading() {
  return (
    <>
      {/* 面包屑骨架 */}
      <section className="py-5" style={{ backgroundColor: "var(--foreground)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded skeleton"
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  width: i === 2 ? "120px" : "60px",
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 产品概览骨架 — 两栏布局匹配实际页面 */}
      <section className="py-10 md:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            {/* 左栏：图片骨架 */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row md:gap-4">
              <div className="flex shrink-0 gap-2 sm:w-16 sm:flex-col md:w-20">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 w-16 shrink-0 rounded-lg md:h-20 md:w-20" />
                ))}
              </div>
              <div className="skeleton aspect-square min-w-0 flex-1 rounded-2xl" />
            </div>

            {/* 右栏：信息骨架 */}
            <div className="space-y-5">
              <div className="h-3 w-24 rounded skeleton bg-[var(--muted)]" />
              <div className="h-8 w-3/4 rounded skeleton bg-[var(--muted)]" style={{ animationDelay: "0.05s" }} />
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 rounded skeleton bg-[var(--muted)]"
                  style={{ width: `${100 - i * 15}%`, animationDelay: `${0.1 + i * 0.05}s` }}
                />
              ))}
              <div className="flex gap-3 pt-4">
                <div className="h-[42px] w-[140px] rounded skeleton bg-[#E5E5E5]" />
                <div className="h-[42px] w-[160px] rounded skeleton bg-[var(--muted)]" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
