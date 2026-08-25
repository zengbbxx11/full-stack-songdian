/**
 * 新闻详情页加载骨架屏
 * ------------------------------------------------------------------
 * 匹配文章详情页的单栏布局，在内容数据获取期间展示。
 */
export default function NewsDetailLoading() {
  const lineWidths = [85, 72, 64, 80, 58, 76, 69, 82];
  return (
    <>
      <section className="bg-[#171A20] py-6 md:py-8"><div className="mx-auto max-w-3xl space-y-4 px-6">
        <div className="skeleton h-8 w-4/5 rounded-full bg-white/10" />
        <div className="skeleton h-8 w-full rounded bg-white/10" /><div className="skeleton h-8 w-3/4 rounded bg-white/10" />
        <div className="skeleton h-4 w-28 rounded bg-white/10" />
      </div></section>
      <article className="bg-white pb-16 pt-8 md:pb-20 md:pt-10"><div className="mx-auto max-w-3xl px-6">
        <div className="skeleton mb-5 aspect-[2/1] max-h-[360px] rounded-xl" />
        <div className="space-y-3">
          {lineWidths.map((width, i) => <div key={i} className="skeleton h-4 rounded" style={{ width: `${width}%` }} />)}
        </div>
      </div></article>
    </>
  );
}
