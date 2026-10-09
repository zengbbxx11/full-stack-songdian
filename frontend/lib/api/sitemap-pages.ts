import type { PageDTO } from "./client";

const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const TIME_BUDGET_MS = 15_000;

/** Read one complete published snapshot, never accept malformed/overlapping pagination. */
export async function getSitemapPages<T extends { slug: string; status: string }>(
  getPage: (page: number, pageSize: number, timeoutMs: number) => Promise<PageDTO<T>>,
): Promise<T[]> {
  const deadline = Date.now() + TIME_BUDGET_MS;
  const rows: T[] = [];
  const slugs = new Set<string>();
  let expectedTotal: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Sitemap pagination time budget exceeded");
    const data = await getPage(page, PAGE_SIZE, Math.min(10_000, remaining));
    if (!data || !Array.isArray(data.list) || !Number.isSafeInteger(data.total) ||
        data.total < 0 || data.total > PAGE_SIZE * MAX_PAGES ||
        data.page !== page || data.page_size !== PAGE_SIZE) {
      throw new Error("Invalid sitemap pagination response");
    }
    if (expectedTotal !== undefined && expectedTotal !== data.total) {
      throw new Error("Sitemap total changed during pagination; retry a fresh snapshot");
    }
    expectedTotal = data.total;
    if (data.list.length !== Math.min(PAGE_SIZE, expectedTotal - rows.length)) {
      throw new Error("Incomplete sitemap pagination");
    }
    for (const row of data.list) {
      // Match the existing backend slug contract; do not invent replacement URLs.
      if (!row || typeof row.slug !== "string" || !/^[a-z0-9-]+$/.test(row.slug) ||
          row.status !== "PUBLISHED" || slugs.has(row.slug)) {
        throw new Error("Invalid or repeated published sitemap entry");
      }
      slugs.add(row.slug);
      rows.push(row);
    }
    if (rows.length === expectedTotal) return rows;
  }
  throw new Error("Sitemap pagination limit exceeded");
}
