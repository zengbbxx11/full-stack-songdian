/*
 * 文件：app/search/loading.tsx
 * 职责：搜索页加载态（路由级骨架屏）。
 * 服务端搜索组件在等待后端 /api/v1/search 时，Next.js 展示此 Suspense 回退，
 * 渲染与结果页同构的 Hero + 搜索框占位 + 骨架卡片网格，避免布局抖动。
 */

import Breadcrumbs from "@/components/Breadcrumbs";
import { generateBreadcrumbs } from "@/lib/seo";
import { SearchResultSkeletonGrid } from "@/components/SearchResultSkeleton";

export default function Loading() {
  const breadcrumbs = generateBreadcrumbs([{ label: "Search" }]);

  return (
    <>
      {/* 首屏 Hero —— 仅含面包屑 */}
      <section className="py-5" style={{ backgroundColor: "#171A20" }}>
        <div className="max-w-7xl mx-auto px-6">
          <Breadcrumbs items={breadcrumbs} variant="dark" />
        </div>
      </section>

      <section className="bg-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-6">
          {/* 标题占位 */}
          <div className="mb-10">
            <div className="h-8 w-40 animate-pulse rounded bg-[#F4F4F4]" />
          </div>
          {/* 搜索框占位 */}
          <div className="mb-4 h-12 w-full animate-pulse rounded-xl bg-[#F4F4F4]" />
          {/* 类型切换占位 */}
          <div className="mb-10 h-12 w-full max-w-md animate-pulse rounded-xl bg-[#F4F4F4]" />
          {/* 骨架卡片网格 */}
          <SearchResultSkeletonGrid />
        </div>
      </section>
    </>
  );
}
