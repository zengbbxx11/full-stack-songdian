import type { Metadata } from "next";
import Image from "next/image";
import { cleanPostContent } from "@/lib/html-cleaner";
import {
  apiFetch,
  toAbsoluteUrl,
  type NewsDetailDTO,
  type ProductDetailDTO,
} from "@/lib/api/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content Preview",
  robots: { index: false, follow: false, nocache: true },
};

type PreviewPayload = {
  resource_type: "product" | "news";
  content: ProductDetailDTO | NewsDetailDTO;
};

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let preview: PreviewPayload | null = null;
  try {
    preview = await apiFetch<PreviewPayload>(`/api/v1/preview/${encodeURIComponent(token)}`, undefined, { revalidate: false });
  } catch {
    preview = null;
  }

  if (!preview) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold text-[#171A20]">Preview link unavailable</h1>
        <p className="mt-3 text-[#5C5E62]">This preview link is invalid or has expired. Generate a new link in the admin panel.</p>
      </section>
    );
  }

  const content = preview.content;
  const image = toAbsoluteUrl(content.cover_image);
  return (
    <article className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Private preview · This page is not indexed and may differ from the published version.
      </div>
      <p className="text-sm font-medium uppercase tracking-wide text-[#d4343e]">{preview.resource_type}</p>
      <h1 className="mt-2 text-3xl font-semibold text-[#171A20] md:text-4xl">{content.title}</h1>
      <p className="mt-4 text-lg leading-8 text-[#5C5E62]">{content.summary}</p>
      {image && (
        <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-xl bg-gray-100">
          <Image src={image} alt={content.title} fill sizes="(max-width: 896px) 100vw, 896px" className="object-contain" priority />
        </div>
      )}
      <div className="article-body mt-10" dangerouslySetInnerHTML={{ __html: cleanPostContent(content.content_html) }} />
    </article>
  );
}
