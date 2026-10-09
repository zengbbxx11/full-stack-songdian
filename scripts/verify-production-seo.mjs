import { pathToFileURL } from "node:url";

// Only the release pipeline uses this guard; development/preview keep opt-in indexing.
export function validateProductionSeo(env) {
  if (env.SEO_INDEXABLE !== "true") {
    throw new Error("Production frontend images require Repository Variable SEO_INDEXABLE=true; build and runtime must agree.");
  }
  let url;
  try { url = new URL(env.NEXT_PUBLIC_SITE_URL); }
  catch { throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/" || /^[0-9.]+$/.test(url.hostname) || !url.hostname.includes(".")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTPS origin without credentials, path, query or fragment.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateProductionSeo(process.env);
  console.log("Production SEO build configuration verified.");
}
