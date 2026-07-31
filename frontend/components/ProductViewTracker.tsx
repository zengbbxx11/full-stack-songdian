"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * 产品详情页 GA4 product_view 事件打点。
 * 放在产品详情页的 Server Component 中作为子组件即可。
 */
export function ProductViewTracker({
  productName,
  productSlug,
}: {
  productName: string;
  productSlug: string;
}) {
  useEffect(() => {
    trackEvent("product_view", {
      product_name: productName,
      product_slug: productSlug,
    });
  }, [productName, productSlug]);

  return null;
}
