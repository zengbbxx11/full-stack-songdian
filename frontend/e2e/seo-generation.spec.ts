import { expect, test } from "@playwright/test";
import { productSeo, newsSeo, seoText, seoExcerpt, categorySeo } from "../lib/content-seo";
import { pageRobots, absoluteSiteUrl } from "../lib/site-url";
import { safeJsonLd, productSchema } from "../lib/seo";

const product = { name: "QA123", categories: [{ id: 1, name: "Compact Cameras", slug: "compact-camera" }], shortDescription: "Native 1080P video.", description: "", attributes: [{ name: "Optical Zoom", slug: "zoom", value: "7X" }], seoTitle: null, seoDescription: null };

test("new models use actual category and optical specification without an editorial map", () => {
  expect(productSeo(product).title).toBe("QA123 Compact Camera — 7X Optical Zoom");
  expect(productSeo(product).description).toContain("Native 1080P video");
  expect(productSeo({ ...product, attributes: [{ name: "Zoom", slug: "zoom", value: "7X Optical Zoom" }] }).title).toContain("7X Optical Zoom");
  expect(productSeo({ ...product, attributes: [{ name: "Digital Zoom", slug: "zoom", value: "16X" }] }).title).not.toContain("Optical");
  expect(productSeo({ ...product, name: "QA123 Compact Camera", attributes: [] }).title).toBe("QA123 Compact Camera");
});

test("manual overrides are independent and whitespace clears them", () => {
  expect(productSeo({ ...product, seoTitle: " Editorial title ", seoDescription: "Exact description" })).toEqual({ title: "Editorial title", description: "Exact description" });
  expect(productSeo({ ...product, seoTitle: "  ", seoDescription: "Only description" })).toEqual({ title: "QA123 Compact Camera — 7X Optical Zoom", description: "Only description" });
});

test("news uses summary then safe body text, never executable content", () => {
  const post = { title: "Buyer guide", excerpt: "", content: "<script>bad()</script><p>Camera &amp; lens</p><p>selection.</p>" };
  expect(newsSeo(post).description).toBe("Camera & lens selection.");
  expect(newsSeo({ ...post, excerpt: "Article summary" }).description).toBe("Article summary");
  expect(newsSeo({ ...post, seoDescription: "Edited excerpt" }).description).toBe("Edited excerpt");
  expect(seoText("<p>One</p><p>Two</p>")).toBe("One Two");
  expect(seoExcerpt("Camera specifications ".repeat(40)).length).toBeLessThanOrEqual(160);
});

test("category metadata is distinct and future categories have an automatic fallback", () => {
  expect(categorySeo(product.categories[0]).description).not.toBe(categorySeo({ id: 2, name: "Kids Camera", slug: "kids-camera" }).description);
  expect(categorySeo({ id: 3, name: "Optical Zoom Camera", slug: "new-category" }).title).toContain("Optical Zoom Camera Manufacturer");
});

test("indexing requires explicit opt-in and page noindex always wins", () => {
  const previous = process.env.SEO_INDEXABLE;
  try {
    delete process.env.SEO_INDEXABLE;
    expect(pageRobots().index).toBe(false);
    process.env.SEO_INDEXABLE = "true";
    expect(pageRobots().index).toBe(true);
    expect(pageRobots(false).googleBot.index).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.SEO_INDEXABLE;
    else process.env.SEO_INDEXABLE = previous;
  }
});

test("canonical normalization preserves meaningful pagination and schema contains no invented offers", () => {
  expect(new URL(absoluteSiteUrl("/products/?category=compact-camera&page=2#top")).pathname).toBe("/products");
  expect(absoluteSiteUrl("/products?page=2")).toContain("?page=2");
  const schema = productSchema({ name: product.name, description: "Camera", url: "/products/compact-camera/qa123" });
  expect(schema).not.toHaveProperty("offers");
  expect(schema).not.toHaveProperty("aggregateRating");
  expect(safeJsonLd({ name: "</script><script>bad()</script>" })).not.toContain("<");
});
