"use client";

import { useReportWebVitals } from "next/web-vitals";
import { trackEvent } from "@/lib/analytics";

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    trackEvent("web_vital", {
      metric_name: metric.name,
      metric_id: metric.id,
      metric_value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
      metric_rating: metric.rating || "unknown",
      page_path: window.location.pathname,
      navigation_type: metric.navigationType || "unknown",
    });
  });
  return null;
}
