import { test, expect } from "@playwright/test";
import { selectNewsProducts, type ProductLink } from "../lib/news-product-links";
import { getProductLinkCatalog } from "../lib/api/products";

const category = { id: 1, name: "Compact Camera", slug: "compact-camera" };
const product = (id: number, slug: string, name = slug.toUpperCase()): ProductLink => ({ id, slug, name, categories: [category] });
test("model suffixes and HTML attributes do not produce false links", () => {
  const products = [product(1, "dc105"), product(2, "dc325")];
  expect(selectNewsProducts('<a href="/dc105">DC105X</a><script>DC105</script><p>DC325</p>', products).map(p => p.slug)).toEqual(["dc325"]);
});
test("visible model names and SKU aliases work when URLs differ", () => {
  const products = [product(1, "dc106", "DC106Y | Flip-top camera"), { ...product(2, "camera-old"), sku: "DC417X" }];
  expect(selectNewsProducts("<p>dc106y</p><p>DC417X</p>", products).map(p => p.slug)).toEqual(["dc106", "camera-old"]);
});
test("formatted model and encoded characters retain exact matches", () => {
  expect(selectNewsProducts("<p>DC<strong>10</strong>5</p><p>DC&#51;25</p>", [product(1, "dc105"), product(2, "dc325")])).toHaveLength(2);
});
test("fallback uses existing priority products with canonical categories only", () => {
  const products = [product(1, "dc417x"), product(2, "dc325"), { ...product(3, "dc105"), categories: [] }, product(4, "dc403"), product(5, "bk05")];
  expect(selectNewsProducts("Factory overview", products).map(p => p.slug)).toEqual(["dc403", "dc325", "dc417x"]);
});

test("catalog reads beyond 50 products and rejects incomplete or repeated pages", async () => {
  const original = globalThis.fetch;
  const first = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, slug: "camera-" + i, title: "Camera " + i, category, sku: null }));
  let mode = "complete";
  const pages: number[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    expect(url.searchParams.get("status")).toBe("PUBLISHED");
    expect(url.searchParams.get("page_size")).toBe("50");
    const page = Number(url.searchParams.get("page")); pages.push(page);
    const list = page === 1 ? first : mode === "empty" ? [] : mode === "duplicate" ? [first[0]] : [{ id: 51, slug: "dc403", title: "DC403", category, sku: "DC403" }];
    return new Response(JSON.stringify({ code: "0", data: { list, total: 51, page, page_size: 50 } }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const catalog = await getProductLinkCatalog();
    expect(pages).toEqual([1, 2]);
    expect(selectNewsProducts("DC403", catalog).map(p => p.slug)).toEqual(["dc403"]);
    mode = "empty";
    await expect(getProductLinkCatalog()).rejects.toThrow("Incomplete");
    mode = "duplicate";
    await expect(getProductLinkCatalog()).rejects.toThrow("Repeated");
  } finally { globalThis.fetch = original; }
});
