"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api/client";

const INTERESTS: Record<string, string> = {
  "compact-camera": "compact-digital-cameras",
  "mirrorless-camera": "mirrorless-cameras",
  "action-camera": "action-cameras",
  "kids-camera": "kids-cameras",
  "video-camera": "video-cameras-camcorders",
};

/** Only this small query-dependent island suspends; the form stays server rendered. */
export default function InquiryProductContext({ onInterest }: { onInterest: (value: string) => void }) {
  const params = useSearchParams();
  const raw = params.get("product") || "";
  const product = /^[a-z0-9-]{1,200}$/.test(raw) ? raw : "";
  const category = params.get("category") || "";

  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let active = true;
    async function resolve() {
      try {
        // New links carry a category hint; older product-only URLs remain supported.
        let slug = category;
        if (!INTERESTS[slug]) {
          const res = await fetch(API_BASE + "/api/v1/products/" + encodeURIComponent(product) + "/canonical", { signal: controller.signal });
          if (!res.ok) return;
          const body = await res.json();
          if (String(body.code) !== "0") return;
          slug = body.data?.category_slug || "";
        }
        if (active && INTERESTS[slug]) onInterest(INTERESTS[slug]);
      } catch {
        // Reference and manual category selection remain available on API failure.
      } finally {
        clearTimeout(timeout);
      }
    }
    void resolve();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [product, category, onInterest]);

  if (!product) return null;
  return <p className="mt-3 rounded-lg bg-[var(--accent)]/5 px-3 py-2 text-sm text-[var(--foreground)]" data-product-reference={product}>
    Product reference: <strong>{product}</strong>
  </p>;
}
