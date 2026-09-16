import Link from "next/link";
import { getProductLinkCatalog } from "@/lib/api/products";
import { productPath } from "@/lib/product-url";
import { selectNewsProducts } from "@/lib/news-product-links";

export default async function NewsProductLinks({ text }: { text: string }) {
  const products = await getProductLinkCatalog().catch(() => []);
  const related = selectNewsProducts(text, products);
  return <aside aria-label="Related camera manufacturing resources" className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-5">
    <h2 className="text-lg font-semibold">Explore cameras and manufacturing services</h2>
    {related.length > 0 && <ul className="mt-3 flex flex-wrap gap-3">
      {related.map(product => <li key={product.id}><Link prefetch={false} className="underline underline-offset-4" href={productPath(product)}>{product.name}</Link></li>)}
    </ul>}
    <p className="mt-4 text-sm leading-relaxed">Explore our <Link prefetch={false} className="underline" href="/solutions">OEM/ODM services</Link>, visit our <Link prefetch={false} className="underline" href="/about">factory overview</Link>, or <Link prefetch={false} className="underline" href="/contact">discuss your project</Link> with our team.</p>
  </aside>;
}
