import { expect, test } from "@playwright/test";
import { getSitemapPages } from "../lib/api/sitemap-pages";
import type { PageDTO } from "../lib/api/client";
type Row = { slug: string; status: string };
const row = (n: number): Row => ({ slug: "item-" + n, status: "PUBLISHED" });
const page = (number: number, total: number, list: Row[]): PageDTO<Row> => ({ page: number, page_size: 50, total, list });

test("published sitemap paginates all entries, including a real empty catalog", async () => {
  const result = await getSitemapPages(async n => page(n, 51, n === 1 ? Array.from({ length: 50 }, (_, i) => row(i)) : [row(50)]));
  expect(result).toHaveLength(51);
  expect(await getSitemapPages(async n => page(n, 0, []))).toEqual([]);
});
test("malformed totals, missing fields and incomplete pages cannot become a successful empty sitemap", async () => {
  for (const data of [{}, { list: [], total: 0 }, page(1, -1, []), page(1, NaN, []), page(1, 10001, []), page(1, 2, [row(1)])])
    await expect(getSitemapPages(async () => data as PageDTO<Row>)).rejects.toThrow();
});
test("overlapping pages, changing totals and incorrect page numbers fail", async () => {
  const first = Array.from({ length: 50 }, (_, i) => row(i));
  await expect(getSitemapPages(async n => page(n, 51, n === 1 ? first : [row(0)]))).rejects.toThrow("repeated");
  await expect(getSitemapPages(async n => page(n, n === 1 ? 51 : 50, n === 1 ? first : []))).rejects.toThrow("total changed");
  await expect(getSitemapPages(async () => page(2, 1, [row(1)]))).rejects.toThrow();
});
test("drafts and invalid URLs are rejected; backend failures propagate", async () => {
  for (const item of [{ slug: "../admin", status: "PUBLISHED" }, { slug: "valid", status: "DRAFT" }])
    await expect(getSitemapPages(async n => page(n, 1, [item]))).rejects.toThrow();
  await expect(getSitemapPages(async () => { throw new Error("Backend 503"); })).rejects.toThrow("Backend 503");
});
test("pagination is bounded by a total time budget", async () => {
  const original = Date.now;
  let calls = 0;
  try {
    Date.now = () => calls++ === 0 ? 0 : 16000;
    await expect(getSitemapPages(async n => page(n, 0, []))).rejects.toThrow("time budget");
  } finally { Date.now = original; }
});
