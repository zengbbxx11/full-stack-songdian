/**
 * 排序选项配置 — 服务端/客户端共享，不含任何 React hooks。
 * URL ?sort= 参数 → 后端 order_by 值的映射。
 */
export const SORT_OPTIONS = [
  { value: "default", label: "Default", orderBy: "sort_order,-created_time" },
  { value: "newest", label: "Newest", orderBy: "-created_time" },
  { value: "name-asc", label: "Name A-Z", orderBy: "title" },
  { value: "name-desc", label: "Name Z-A", orderBy: "-title" },
] as const;

/** 根据 URL ?sort= 获取对应的后端 order_by 值。服务端安全调用。 */
export function getSortOrderBy(sortValue: string | undefined): string {
  const found = SORT_OPTIONS.find((o) => o.value === (sortValue || "default"));
  return found?.orderBy || "sort_order,-created_time";
}
