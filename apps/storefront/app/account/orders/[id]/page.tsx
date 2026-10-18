import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { AccountNav } from "@/components/account/AccountNav"
import { LineItems } from "@/components/cart/LineItems"
import { canViewOrder, getCustomer, getOrder } from "@/lib/server/customer"
import { formatMajor } from "@/lib/money"

export const metadata: Metadata = { title: "Order details", robots: { index: false, follow: false } }

type Props = { params: Promise<{ id: string }> }

export default async function OrderPage({ params }: Props) {
  await connection()
  const { id } = await params
  const customer = await getCustomer()
  if (!customer) redirect(`/account/login?next=/account/orders/${encodeURIComponent(id)}`)
  const order = await getOrder(id)
  if (!order || !(await canViewOrder(order, customer))) notFound()
  const a = order.shipping_address
  return (
    <main id="main" className="h-container s-page">
      <h1>Order #{order.display_id}</h1>
      <AccountNav current="/account" />
      <p>
        Placed {new Date(order.created_at).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "long" })} · Status: {(order.fulfillment_status ?? order.status).replace(/_/g, " ")}
      </p>
      <LineItems items={order.items ?? []} currency={order.currency_code} editable={false} />
      <dl className="s-summary">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMajor(order.item_total ?? order.subtotal ?? 0, order.currency_code)}</dd>
        </div>
        {Number(order.discount_total ?? 0) > 0 ? (
          <div>
            <dt>Discount</dt>
            <dd>−{formatMajor(order.discount_total ?? 0, order.currency_code)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Shipping</dt>
          <dd>{formatMajor(order.shipping_total ?? 0, order.currency_code)}</dd>
        </div>
        <div className="s-summary__total">
          <dt>Total</dt>
          <dd>{formatMajor(order.total, order.currency_code)}</dd>
        </div>
      </dl>
      {a ? (
        <section aria-labelledby="ship-to" className="s-section">
          <h2 id="ship-to">Delivering to</h2>
          <address>
            {a.first_name} {a.last_name}
            <br />
            {a.address_1}
            <br />
            {a.city}, {a.province} {a.postal_code}, {a.country_code?.toUpperCase()}
          </address>
        </section>
      ) : null}
      <p>
        <Link href="/track">Track this order</Link>
      </p>
    </main>
  )
}
