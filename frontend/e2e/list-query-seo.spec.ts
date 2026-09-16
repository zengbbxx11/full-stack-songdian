import { test, expect } from "@playwright/test";
import { readListQuery, listUrl } from "../lib/list-query";
import { gotoHydrated } from "./hydration";

test("list parameters use the first value and reject unsafe page numbers", () => {
  expect(readListQuery({ category: ["compact-camera", "kids-camera"], page: ["2", "3"] })).toEqual({ category: "compact-camera", page: 2 });
  for (const page of ["", "-1", "1.5", "NaN", "Infinity", "9007199254740992"]) {
    expect(readListQuery({ page }).page).toBe(1);
  }
  expect(listUrl("/products", 1, "compact-camera")).toBe("/products?category=compact-camera");
  expect(listUrl("/news", 2, "a&b")).toBe("/news?category=a%26b&page=2");
});

test("repeated product filters do not crash and pagination matches canonical", async ({ page }) => {
  await gotoHydrated(page, "/products?category=compact-camera&category=kids-camera&page=2&page=3");
  await expect(page.locator("main h1")).toHaveText("Compact Camera");
  await expect(page).toHaveTitle(/Page 2/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products\?category=compact-camera&page=2$/);
  await expect(page.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", "/products?category=compact-camera");
  await expect(page.locator('a[aria-current="page"]').filter({ hasText: "Compact Camera" })).toBeVisible();
});

test("unknown product filters show the all-products selection and clean links", async ({ page }) => {
  await gotoHydrated(page, "/products?category=not-a-real-category");
  await expect(page.locator("main h1")).toHaveText("Camera Products");
  await expect(page.getByRole("link", { name: "All Products", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products$/);
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/products?page=2");
});

test("News resolves repeated filters consistently with metadata", async ({ page }) => {
  await gotoHydrated(page, "/news?category=news&category=company&page=2&page=1");
  await expect(page.locator("main h1")).toHaveText("News");
  await expect(page).toHaveTitle(/Page 2/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/news\?category=news&page=2$/);
  await expect(page.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", "/news?category=news");
});
