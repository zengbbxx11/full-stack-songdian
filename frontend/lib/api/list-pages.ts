import { cache } from "react";
import type { WCProductCategory } from "@/lib/types";
import type { PageMeta } from "./client";
import { getProducts, getProductCategories, PRODUCTS_PER_PAGE } from "./products";
import { getPosts, getNewsCategories, NEWS_PER_PAGE } from "./news";

async function loadListing<T>(
  slug: string | undefined,
  getCategories: () => Promise<WCProductCategory[]>,
  getItems: (categoryId?: number) => Promise<{ items: T[]; pagination: PageMeta | null }>,
) {
  let categories: WCProductCategory[] = [];
  let category: WCProductCategory | undefined;
  try {
    categories = await getCategories();
    category = categories.find(c => c.slug.toLowerCase() === slug?.toLowerCase());
    const data = await getItems(category?.id);
    return { ...data, categories, category, failed: false, retryCategory: category?.slug };
  } catch {
    // Never interpret an unavailable category service as a successful unfiltered lookup.
    return { items: [] as T[], pagination: null, categories, category, failed: true, retryCategory: category?.slug || slug };
  }
}

// Request-scoped sharing: metadata and body see the same success/failure, with no duplicate retry.
export const getProductsPage = cache((page: number, slug?: string) =>
  loadListing(slug, getProductCategories, async category => {
    const { products, pagination } = await getProducts({ page, perPage: PRODUCTS_PER_PAGE, category });
    return { items: products, pagination };
  }),
);
export const getNewsPage = cache((page: number, slug?: string) =>
  loadListing(slug, getNewsCategories, async categoryId => {
    const { posts, pagination } = await getPosts({ page, perPage: NEWS_PER_PAGE, categoryId });
    return { items: posts, pagination };
  }),
);
