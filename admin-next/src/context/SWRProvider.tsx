/*
 * Context：SWR 全局配置（issue #23 渐进式接入）。
 *
 * 必须以客户端组件形式存在：SWRConfig 的 `value` 携带 `fetcher` 函数，
 * 若直接在 Server Component（如根 layout）里塞函数 props，Next.js 会因
 * 无法序列化函数而报 "Functions cannot be passed directly to Client Components"。
 * 故抽成独立的 "use client" Provider，由根 layout 以 <SWRProvider> 包裹 children。
 *
 * 默认 fetcher 复用 apiFetch 的鉴权（Bearer）+ 信封解包逻辑；后台面板无需
 * 聚焦自动重校，故关闭 revalidateOnFocus 以减少无谓请求。
 */
"use client";

import type React from "react";
import { SWRConfig } from "swr";
import { swrFetcher } from "@/lib/api-client";

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: (path: string) => swrFetcher(path),
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
