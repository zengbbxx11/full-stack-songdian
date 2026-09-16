import Image from "next/image";
import sanitizeHtml from "sanitize-html";
import { toAbsoluteUrl } from "@/lib/api/client";

export function readProductDetailImages(html: string) {
  const images: { src: string; alt: string; width?: number; height?: number }[] = [];
  const clean = sanitizeHtml(html, {
    allowedTags: ["img"],
    allowedAttributes: { img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
  });
  sanitizeHtml(clean, {
    allowedTags: ["img"],
    transformTags: { img: (tagName, attrs) => {
      const width = Number(attrs.width), height = Number(attrs.height);
      if (attrs.src) images.push({
        src: attrs.src.startsWith("/uploads/") ? toAbsoluteUrl(attrs.src)! : attrs.src,
        alt: attrs.alt || "",
        width: Number.isInteger(width) && width > 0 ? width : undefined,
        height: Number.isInteger(height) && height > 0 ? height : undefined,
      });
      return { tagName, attribs: attrs };
    } },
  });
  return images;
}

export default function ProductDetailImages({ html, name }: { html: string; name: string }) {
  const images = readProductDetailImages(html);
  if (!images.length) return null;
  return <section aria-label={name + " product details"} className="bg-white py-8 md:py-14">
    <div className="mx-auto max-w-5xl px-4">
      {images.map((img, i) => img.width && img.height && img.src.startsWith(toAbsoluteUrl("/uploads/")!) ? <Image key={i} src={img.src}
        alt={img.alt || name + " detail " + (i + 1)} width={img.width} height={img.height}
        sizes="(max-width: 1024px) calc(100vw - 32px), 992px"
        loading="lazy" className="block h-auto w-full" />
        // Legacy/external sources bypass the optimizer without broadening its host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        : <img key={i} src={img.src} alt={img.alt || name + " detail " + (i + 1)}
          width={img.width} height={img.height} loading="lazy" decoding="async" className="block h-auto w-full" />)}
    </div>
  </section>;
}
