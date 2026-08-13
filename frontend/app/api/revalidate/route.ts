import { revalidatePath, revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

const ALLOWED_TAGS = /^(products|product-categories|product:[a-z0-9-]+|news|news-categories|news:[a-z0-9-]+)$/;
const ALLOWED_PATHS = new Set(["/", "/products", "/news", "/sitemap.xml"]);

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ revalidated: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    tags?: unknown;
    paths?: unknown;
  };
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((value): value is string => typeof value === "string" && ALLOWED_TAGS.test(value))
    : [];
  const paths = Array.isArray(body.paths)
    ? body.paths.filter((value): value is string => typeof value === "string" && ALLOWED_PATHS.has(value))
    : [];

  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
  for (const path of new Set(paths)) revalidatePath(path);

  return Response.json({ revalidated: true, tags: tags.length, paths: paths.length });
}
