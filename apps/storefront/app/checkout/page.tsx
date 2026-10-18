import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow"
import { CartSummary } from "@/components/cart/CartSummary"
import { LineItems } from "@/components/cart/LineItems"
import { getCart } from "@/lib/server/cart"
import { getSettings } from "@/lib/server/catalog"
import { getCustomer } from "@/lib/server/customer"
import { getRegion } from "@/lib/server/region"

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false }, alternates: { canonical: "/checkout" } }

type Props = { searchParams: Promise<{ payment_error?: string }> }

export default async function CheckoutPage({ searchParams }: Props) {
  await connection()
  const [cart, settings, customer, { country }, sp] = await Promise.all([getCart(), getSettings(), getCustomer(), getRegion(), searchParams])
  if (!cart || !(cart.items ?? []).length) redirect("/cart")
  const address = cart.shipping_address?.address_1 ? cart.shipping_address : (customer?.addresses?.[0] ?? null)
  const itemCount = (cart.items ?? []).reduce((n, i) => n + i.quantity, 0)
  return (
    <main id="main" className="h-container s-page s-checkout">
      <h1>Checkout</h1>
      {sp.payment_error ? (
        <p role="alert" className="s-notice s-notice--error">
          Your payment was not completed. Please try again or choose another method.
        </p>
      ) : null}
      {!customer ? (
        <p className="s-small">
          Checking out as a guest. <Link href="/account/login?next=/checkout">Sign in</Link> for faster checkout and order history.
        </p>
      ) : null}
      <div className="s-checkout__layout">
        <CheckoutFlow
          email={cart.email ?? customer?.email ?? ""}
          address={address}
          country={country}
          appliedCodes={(cart.promotions ?? []).filter((p) => p.code && !p.is_automatic).map((p) => p.code!)}
          itemCount={itemCount}
          cartValue={Number(cart.total ?? 0)}
          currency={cart.currency_code}
        />
        <aside className="s-checkout__aside" aria-labelledby="order-summary">
          <h2 id="order-summary">Order summary</h2>
          <LineItems items={cart.items ?? []} currency={cart.currency_code} editable={false} />
          <CartSummary cart={cart} dutiesMessage={settings.duties_message} showShipping />
          <p className="s-small">
            <Link href="/cart">Edit bag</Link>
          </p>
        </aside>
      </div>
    </main>
  )
}
