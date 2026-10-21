import Link from "next/link"
import { ProductImage } from "@/components/ui/ProductImage"
import type { Shop } from "@/lib/content"

/** Curated edits: a portrait photograph per edit, the title in display type beneath it. */
export function ShopTiles({
  shops,
  images = {},
  headingLevel = "h3",
}: {
  shops: Shop[]
  /** One representative image per edit, keyed by slug. */
  images?: Record<string, string | null | undefined>
  headingLevel?: "h2" | "h3"
}) {
  const H = headingLevel
  return (
    <ul className="s-shop-tiles">
      {shops.map((s) => (
        <li key={s.slug}>
          <Link href={`/shops/${s.slug}`} className="s-shop-tile" data-testid="shop-tile">
            <span className="s-shop-tile__media">
              <ProductImage src={images[s.slug]} alt="" sizes="(min-width: 1100px) 31vw, (min-width: 700px) 48vw, 100vw" />
            </span>
            <H className="s-shop-tile__title h-display">{s.title}</H>
            <span className="s-shop-tile__tag">{s.tagline}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
