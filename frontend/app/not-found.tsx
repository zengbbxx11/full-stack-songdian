/**
 * 404 页面 — 路由未匹配时展示
 * ------------------------------------------------------------------
 * 遵循 Tesla 极简设计：Carbon Dark 标题、Pewter 副文案、
 * Electric Blue CTA 按钮、4px 圆角、0.33s 过渡。
 */
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <p
        className="text-[120px] font-bold leading-none mb-2 select-none"
        style={{ color: "#171A20", opacity: 0.06 }}
        aria-hidden="true"
      >
        404
      </p>
      <h1 className="text-2xl font-bold text-[#171A20] mb-3">Page not found</h1>
      <p className="text-sm text-[#5C5E62] max-w-md mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center px-6 text-white text-sm font-medium rounded h-[42px] transition-colors"
          style={{
            backgroundColor: "#3E6AE1",
            borderRadius: "4px",
            transitionDuration: "0.33s",
          }}
        >
          Back to Home
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center px-6 text-sm font-medium rounded h-[42px] border border-[#D0D1D2] text-[#393C41] transition-colors hover:bg-[#F4F4F4]"
          style={{
            borderRadius: "4px",
            transitionDuration: "0.33s",
          }}
        >
          Browse Products
        </Link>
      </div>
    </div>
  );
}
