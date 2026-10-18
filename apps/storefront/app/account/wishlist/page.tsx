import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Price } from "@haanta/ui"
import { ProductImage } from "@/components/ui/ProductImage"
import { WishlistButton } from "@/components/product/WishlistButton"
import { getProductsByIds, productPrice } from "@/lib/server/catalog"
import { getWishlistIds, isSignedIn } from "@/lib/server/customer"
import { getRegion } from "@/lib/server/region"
import { toMinor } from "@/lib/money"
import { AccountNav } from "@/components/account/AccountNav"

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } }

export default async function WishlistPage() {
  await connection()
  const [ids, { region }, signedIn] = await Promise.all([getWishlistIds(), getRegion(), isSignedIn()])
  const products = await getProductsByIds(ids, region?.id)
  const ordered = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  return (
    <main id="main" className="h-container s-page">
      <h1>Wishlist</h1>
      {signedIn ? <AccountNav current="/account/wishlist" /> : <p className="s-small">Your wishlist is saved on this device.</p>}
      {ordered.length ? (
        <ul className="s-grid" data-testid="wishlist-grid">
          {ordered.map((p) => {
            const price = productPrice(p)
            return (
              <li key={p.id}>
                <article className="s-card">
                  <div className="s-card__media">
                    <ProductImage src={p.thumbnail} alt="" sizes="(min-width: 768px) 25vw, 50vw" />
                    <div className="s-card__heart">
                      <WishlistButton productId={p.id} title={p.title} initialSaved />
                    </div>
                  </div>
                  <div className="s-card__body">
                    <h2 className="s-card__title">
                      <Link href={`/products/${p.handle}`}>{p.title}</Link>
                    </h2>
                    {price.amount != null ? (
                      <p className="s-card__price">
                        <Price amountMinor={toMinor(price.amount)} currency={price.currency.toUpperCase()} compareAtMinor={price.original != null ? toMinor(price.original) : null} />
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="s-empty">
          <p>Nothing saved yet. Tap the heart on any piece to save it here.</p>
          <Link href="/shop" className="h-btn h-btn--primary">
            Browse the shop
          </Link>
        </div>
      )}
    </main>
  )
}
