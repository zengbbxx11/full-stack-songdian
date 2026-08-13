"use client";

import { useEffect } from "react";

export const ATTRIBUTION_STORAGE_KEY = "songdian:first-attribution";
const TRACKED_QUERY_PARAMS = [
  "product",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export interface FirstAttribution {
  landing_page: string;
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

export function readFirstAttribution(): FirstAttribution | null {
  try {
    const value = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return value ? (JSON.parse(value) as FirstAttribution) : null;
  } catch {
    return null;
  }
}

export function trackedPagePath(maxLength = 1000): string {
  const current = new URLSearchParams(window.location.search);
  const tracked = new URLSearchParams();
  for (const key of TRACKED_QUERY_PARAMS) {
    const value = current.get(key);
    if (value) tracked.set(key, value.slice(0, 200));
  }
  const query = tracked.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`.slice(0, maxLength);
}

function safeReferrer(): string {
  if (!document.referrer) return "";
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return "";
  }
}

export default function AttributionTracker() {
  useEffect(() => {
    if (readFirstAttribution()) return;
    const searchParams = new URLSearchParams(window.location.search);
    const attribution: FirstAttribution = {
      landing_page: trackedPagePath(),
      referrer: safeReferrer(),
      utm_source: (searchParams.get("utm_source") || "").slice(0, 200),
      utm_medium: (searchParams.get("utm_medium") || "").slice(0, 200),
      utm_campaign: (searchParams.get("utm_campaign") || "").slice(0, 200),
      utm_term: (searchParams.get("utm_term") || "").slice(0, 200),
      utm_content: (searchParams.get("utm_content") || "").slice(0, 200),
    };
    try {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Browsing remains functional when storage is unavailable.
    }
  }, []);

  return null;
}
