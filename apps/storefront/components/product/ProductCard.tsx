import Link from "next/link"
import { Badge, Price } from "@haanta/ui"
import { ProductImage } from "@/components/ui/ProductImage"
import { docPrice } from "@/lib/money"
import type { BadgeKind, SearchDocument } from "@/lib/types"

export function docBadges(d: SearchDocument): BadgeKind[] {
  const b: BadgeKind[] = []
  if (d.is_new) b.push("new")
  if (d.is_preorder) b.push("preorder")
  if (d.fulfilment === "made_to_order") b.push("made_to_order")
  if (d.on_sale) b.push("sale")
  return b
}

export function shipsFromText(ships: ("lagos" | "houston")[]): string {
  const us = ships.includes("houston")
  const ng = ships.includes("lagos")
  if (us && ng) return "Ships from the US or Nigeria"
  if (us) return "Ships from the US"
  return "Ships from Nigeria"
}

export function ProductCard({ doc, currency, saved, priority = false }: { doc: SearchDocument; currency: string; saved: boolean; priority?: boolean }) {
  const price = docPrice(doc, currency)
  const href = `/products/${doc.handle}`
  const badges = docBadges(doc)
  return (
    <article className="s-card" data-testid="product-card" data-ships-from={doc.ships_from.join(",")} data-fulfilment={doc.fulfilment}>
      <div className="s-card__media">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="s-card__img-link">
          <ProductImage src={doc.images?.[0] ?? doc.thumbnail} alt="" sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw" priority={priority} />
          {doc.images?.[1] ? <ProductImage src={doc.images[1]} alt="" sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 50vw" className="s-card__alt" /> : null}
        </Link>
        {badges.length ? (
          <div className="s-card__badges">
            {badges.map((b) => (
              <Badge key={b} kind={b} />
            ))}
          </div>
        ) : null}
        <div className="s-card__heart">
          {/* Handled by the page-level CardActions controller (no per-card React island). */}
          <button type="button" className="s-heart" aria-pressed={saved} aria-label={`Save ${doc.title} to wishlist`} data-wishlist={doc.id} data-testid="wishlist-toggle">
            <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24">
              <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.4 3.6 4.1 6.8C19.5 16.4 12 21 12 21z" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
      <div className="s-card__body">
        <p className="s-card__brand">{doc.vendor.name}</p>
        <h3 className="s-card__title">
          <Link href={href} data-testid="product-card-link">
            {doc.title}
          </Link>
        </h3>
        <p className="s-card__price">
          <Price amountMinor={price.amountMinor} currency={price.currency} compareAtMinor={price.compareAtMinor} />
        </p>
        <p className="s-card__ships">{shipsFromText(doc.ships_from)}</p>
        <button type="button" className="s-quickview-btn" aria-haspopup="dialog" data-quickview={doc.handle} data-title={doc.title} data-testid="quick-view-button">
          Quick view<span className="h-sr-only">: {doc.title}</span>
        </button>
      </div>
    </article>
  )
}

export function ProductGrid({ docs, currency, savedIds, label, priorityCount = 0 }: { docs: SearchDocument[]; currency: string; savedIds: string[]; label?: string; priorityCount?: number }) {
  return (
    <ul className="s-grid" aria-label={label} data-testid="product-grid">
      {docs.map((d, i) => (
        <li key={d.id}>
          <ProductCard doc={d} currency={currency} saved={savedIds.includes(d.id)} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  )
}
