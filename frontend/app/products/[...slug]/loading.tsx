/** Loading order and breakpoints mirror the product overview, including mobile inquiry placement. */
export default function ProductDetailLoading() {
  return (
    <div role="status" aria-label="Loading product">
      <section className="border-b border-white/10 bg-[var(--surface-dark)] py-5" aria-hidden="true">
        <div className="site-container"><div className="h-10 w-3/4 rounded-full skeleton" /></div>
      </section>
      <section className="bg-white py-8 md:py-16" aria-hidden="true">
        <div className="site-container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div className="lg:order-2 lg:self-start">
              <div className="mb-4 h-4 w-28 rounded skeleton" />
              <div className="mb-6 h-12 w-3/4 rounded skeleton md:h-16" />
              <div className="mb-5 space-y-2">
                {[0, 1, 2].map(i => <div key={i} className="space-y-1">
                  <div className="h-4 w-28 rounded skeleton" />
                  <div className="h-5 w-3/4 rounded skeleton" />
                </div>)}
              </div>
              <div className="mb-8 flex flex-wrap gap-3">
                <div className="h-12 w-44 rounded-2xl skeleton" />
                <div className="h-12 w-56 rounded-2xl skeleton" />
              </div>
              <div className="mb-8 h-5 w-48 rounded skeleton" />
              <div className="h-20 rounded-2xl skeleton" />
            </div>
            <div className="lg:order-1">
              <div className="flex flex-col-reverse gap-3 sm:flex-row md:gap-4">
                <div className="flex shrink-0 gap-2 sm:w-16 sm:flex-col md:w-20">
                  {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-16 shrink-0 rounded-lg md:h-20 md:w-20" />)}
                </div>
                <div className="skeleton aspect-square min-w-0 flex-1 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
