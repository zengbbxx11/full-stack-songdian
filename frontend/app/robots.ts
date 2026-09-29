import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteSiteUrl, isSiteIndexable } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  if (!isSiteIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  // Search/preview HTML carries noindex. Do not block it from being read by crawlers.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
