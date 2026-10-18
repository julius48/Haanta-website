import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { LineItems } from "@/components/cart/LineItems"
import { canViewOrder, getCustomer, getOrder } from "@/lib/server/customer"
import { formatMajor } from "@/lib/money"

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false, follow: false } }

type Props = { params: Promise<{ id: string }> }

export default async function OrderConfirmedPage({ params }: Props) {
  await connection()
  const { id } = await params
  const [order, customer] = await Promise.all([getOrder(id), getCustomer()])
  const visible = order ? await canViewOrder(order, customer) : false
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1 data-testid="order-confirmed">Thank you for your order</h1>
      {order && visible ? (
        <>
          <p className="s-lead">
            Order <strong data-testid="order-number">#{order.display_id}</strong> is confirmed. We&apos;ve emailed a receipt to {order.email ?? "you"}.
          </p>
          <LineItems items={order.items ?? []} currency={order.currency_code} editable={false} />
          <dl className="s-summary">
            <div>
              <dt>Shipping</dt>
              <dd>{formatMajor(order.shipping_total ?? 0, order.currency_code)}</dd>
            </div>
            <div className="s-summary__total">
              <dt>Total paid</dt>
              <dd>{formatMajor(order.total, order.currency_code)}</dd>
            </div>
          </dl>
          <p>
            Made-to-order and pre-order pieces go into production now; we&apos;ll email you when each part of your order ships. You can follow progress any time on the{" "}
            <Link href="/track">tracking page</Link> with your order number and email.
          </p>
        </>
      ) : (
        <p>Your order has been placed. Check your email for the confirmation and order number, then follow it on our <Link href="/track">tracking page</Link>.</p>
      )}
      <Link href="/shop" className="h-btn h-btn--secondary">
        Continue shopping
      </Link>
    </main>
  )
}
