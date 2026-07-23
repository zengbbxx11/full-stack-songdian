/*
 * 文件：components/SearchResultSkeleton.tsx
 * 职责：搜索结果加载态骨架（与结果网格同构，避免加载完成后的布局抖动）。
 * 纯展示组件，供 app/search/loading.tsx 复用。
 */

/**
 * 渲染一组骨架卡片（默认 6 张），模拟封面卡片网格的占位形态。
 * @param count 骨架卡片数量
 */
export function SearchResultSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border border-[#EEEEEE] bg-white"
        >
          {/* 封面图占位 */}
          <div className="aspect-[4/3] w-full animate-pulse bg-[#F4F4F4]" />
          {/* 文本占位 */}
          <div className="flex flex-col gap-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#F4F4F4]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#F4F4F4]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[#F4F4F4]" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[#F4F4F4]" />
          </div>
        </div>
      ))}
    </div>
  );
}
