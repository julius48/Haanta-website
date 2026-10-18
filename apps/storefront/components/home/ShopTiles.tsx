import Link from "next/link"
import type { Shop } from "@/lib/content"

/** Curated shop tiles: brown gradient with tan display type (tan only ever sits on brown). */
export function ShopTiles({ shops, headingLevel = "h3" }: { shops: Shop[]; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel
  return (
    <ul className="s-shop-tiles">
      {shops.map((s) => (
        <li key={s.slug}>
          <Link href={`/shops/${s.slug}`} className="s-shop-tile" data-testid="shop-tile">
            <H className="s-shop-tile__title h-display">{s.title}</H>
            <span className="s-shop-tile__tag">{s.tagline}</span>
            <span className="s-shop-tile__cta" aria-hidden="true">
              Shop now →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
