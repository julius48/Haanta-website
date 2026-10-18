import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { CartSummary } from "@/components/cart/CartSummary"
import { LineItems } from "@/components/cart/LineItems"
import { PromoForm } from "@/components/cart/PromoForm"
import { getCart } from "@/lib/server/cart"
import { getSettings } from "@/lib/server/catalog"
import { formatMajor, freeShippingProgress } from "@/lib/money"

export const metadata: Metadata = { title: "Your bag", robots: { index: false, follow: false }, alternates: { canonical: "/cart" } }

export default async function CartPage() {
  await connection()
  const [cart, settings] = await Promise.all([getCart(), getSettings()])
  const items = cart?.items ?? []
  if (!cart || !items.length) {
    return (
      <main id="main" className="h-container s-page">
        <h1>Your bag</h1>
        <div className="s-empty" data-testid="cart-empty">
          <p>Your bag is empty.</p>
          <Link href="/shop" className="h-btn h-btn--primary">
            Start shopping
          </Link>
        </div>
      </main>
    )
  }
  const subtotal = Number(cart.item_subtotal ?? cart.subtotal ?? 0)
  const isUsd = cart.currency_code.toLowerCase() === "usd"
  const progress = freeShippingProgress(subtotal, settings.free_shipping_threshold_usd)
  return (
    <main id="main" className="h-container s-page">
      <h1>Your bag</h1>
      <div className="s-cart">
        <section aria-labelledby="lines-title" className="s-cart__lines">
          <h2 id="lines-title" className="h-sr-only">
            Items
          </h2>
          <LineItems items={items} currency={cart.currency_code} editable />
        </section>
        <aside className="s-cart__aside" aria-labelledby="summary-title">
          <h2 id="summary-title">Summary</h2>
          {isUsd ? (
            <div className="s-progress" data-testid="free-shipping-progress">
              <p>
                {progress.reached
                  ? "You've unlocked free standard shipping."
                  : `You're ${formatMajor(progress.remaining, "usd")} away from free standard shipping.`}
              </p>
              <progress max={100} value={progress.percent} aria-label="Progress towards free standard shipping">
                {progress.percent}%
              </progress>
            </div>
          ) : (
            <p className="s-small">Free standard shipping on orders over US${settings.free_shipping_threshold_usd}.</p>
          )}
          <CartSummary cart={cart} dutiesMessage={settings.duties_message} showShipping={false} />
          <PromoForm applied={(cart.promotions ?? []).filter((p) => p.code && !p.is_automatic).map((p) => p.code!)} />
          <Link href="/checkout" className="h-btn h-btn--primary s-btn-block" data-testid="checkout-button">
            Checkout securely
          </Link>
          <p className="s-small s-muted">Apple Pay, Google Pay, cards, Klarna and PayPal accepted.</p>
        </aside>
      </div>
    </main>
  )
}
