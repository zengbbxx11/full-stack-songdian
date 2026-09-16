export type ListSearchParams = { category?: string | string[]; page?: string | string[] };

// Next represents repeated keys as arrays. Resolve them once for both metadata and content.
export function readListQuery(params: ListSearchParams) {
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const page = Number(first(params.page));
  return {
    category: first(params.category) || undefined,
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

export function listUrl(path: "/products" | "/news", page: number, category?: string) {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (page > 1) query.set("page", String(page));
  return path + (query.size ? "?" + query.toString() : "");
}
