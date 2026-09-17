import { test, expect } from "@playwright/test";
import { readListQuery, listUrl } from "../lib/list-query";
import { gotoHydrated } from "./hydration";
import { adminRequest, cleanup, createNews, createNewsCategory, createProduct, createProductCategory, removeNews, removeProducts } from "./fixtures";

test("list parameters use the first value and reject unsafe page numbers", () => {
  expect(readListQuery({ category: ["compact-camera", "kids-camera"], page: ["2", "3"] })).toEqual({ category: "compact-camera", page: 2 });
  for (const page of ["", "-1", "1.5", "NaN", "Infinity", "9007199254740992"]) {
    expect(readListQuery({ page }).page).toBe(1);
  }
  expect(listUrl("/products", 1, "compact-camera")).toBe("/products?category=compact-camera");
  expect(listUrl("/news", 2, "a&b")).toBe("/news?category=a%26b&page=2");
});

/** 造 n 个同分类的已发布产品：产品每页 12 条，需要 ≥13 条才出现第 2 页。 */
async function productsFixture(count: number) {
  const admin = await adminRequest();
  const category = await createProductCategory(admin, "List fixture");
  const ids: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push((await createProduct(admin, { categoryId: category.id, index: i + 1 })).id);
  }
  return {
    admin,
    category,
    dispose: async () => {
      await cleanup([() => removeProducts(admin, ids), () => admin.delete(`/api/v1/admin/categories/${category.id}`)]);
    },
  };
}

test("repeated product filters do not crash and pagination matches canonical", async ({ page }) => {
  const fixture = await productsFixture(13);
  try {
    await gotoHydrated(page, `/products?category=${fixture.category.slug}&category=${fixture.category.slug}-other&page=2&page=3`);
    await expect(page.locator("main h1")).toHaveText(fixture.category.name);
    await expect(page).toHaveTitle(/Page 2/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/products\\?category=${fixture.category.slug}&page=2$`));
    await expect(page.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", `/products?category=${fixture.category.slug}`);
    await expect(page.locator('a[aria-current="page"]').filter({ hasText: fixture.category.name })).toBeVisible();
  } finally {
    await fixture.dispose();
  }
});

test("unknown product filters show the all-products selection and clean links", async ({ page }) => {
  const fixture = await productsFixture(13);
  try {
    await gotoHydrated(page, `/products?category=fixture-missing-${Date.now()}`);
    await expect(page.locator("main h1")).toHaveText("Camera Products");
    await expect(page.getByRole("link", { name: "All Products", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products$/);
    await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/products?page=2");
  } finally {
    await fixture.dispose();
  }
});

test("News resolves repeated filters consistently with metadata", async ({ page }) => {
  // 新闻每页 9 条，需要 ≥10 条同分类已发布文章才出现第 2 页。
  const admin = await adminRequest();
  const category = await createNewsCategory(admin, "News list fixture");
  const news = await createNews(admin, { categoryId: category.id, count: 10 });
  try {
    await gotoHydrated(page, `/news?category=${category.slug}&category=${category.slug}&page=2&page=1`);
    await expect(page.locator("main h1")).toHaveText(category.name);
    await expect(page).toHaveTitle(/Page 2/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/news\\?category=${category.slug}&page=2$`));
    await expect(page.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", `/news?category=${category.slug}`);
  } finally {
    await cleanup([() => removeNews(admin, news.ids), () => admin.delete(`/api/v1/admin/news-categories/${category.id}`)]);
  }
});
