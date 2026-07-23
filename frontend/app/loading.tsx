/**
 * 全局加载骨架屏
 * ------------------------------------------------------------------
 * 在页面数据加载期间展示，避免白屏。顶部品牌红进度条 +
 * 中间脉冲骨架提供视觉反馈，减轻用户等待焦虑。
 */
export default function LoadingPage() {
  return (
    <>
      {/* 顶部加载指示条 — 品牌红脉冲动画 */}
      <div className="fixed top-14 left-0 right-0 z-50 h-[2px] bg-[#EEEEEE]">
        <div
          className="h-full animate-loading-bar"
          style={{ backgroundColor: "#d4343e", width: "40%" }}
        />
      </div>

      {/* 骨架内容区 */}
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
        {/* 标题骨架 */}
        <div className="mb-12">
          <div
            className="h-3 w-24 rounded animate-pulse mb-4"
            style={{ backgroundColor: "#E5E5E5" }}
          />
          <div
            className="h-8 w-64 rounded animate-pulse"
            style={{
              backgroundColor: "#E5E5E5",
              animationDelay: "0.1s",
            }}
          />
        </div>

        {/* 卡片网格骨架 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div
                className="aspect-[3/4] rounded-xl animate-pulse"
                style={{
                  backgroundColor: "#E5E5E5",
                  animationDelay: `${i * 0.1}s`,
                }}
              />
              <div
                className="h-4 w-3/4 rounded animate-pulse"
                style={{
                  backgroundColor: "#E5E5E5",
                  animationDelay: `${i * 0.1 + 0.05}s`,
                }}
              />
              <div
                className="h-3 w-1/2 rounded animate-pulse"
                style={{
                  backgroundColor: "#E5E5E5",
                  animationDelay: `${i * 0.1 + 0.1}s`,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
