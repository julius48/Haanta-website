import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Chip, OrderChip } from "@/components/chips"
import { OrderActions } from "@/components/order-actions"
import { MEASUREMENTS } from "@/lib/listing"
import { formatMinor } from "@/lib/money"
import { RESOURCE_ID } from "@/lib/server/forms"
import { vendorGetOrNull } from "@/lib/server/session"
import { CARRIERS, formatDate, isOrderLate } from "@/lib/status"
import type { VendorOrder } from "@/lib/types"

export const metadata: Metadata = { title: "Order" }

const MEASUREMENT_LABEL: Record<string, string> = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, m.label]))

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!RESOURCE_ID.test(id)) notFound()
  const data = await vendorGetOrNull<{ order: VendorOrder }>(`/vendor/orders/${id}`)
  if (!data) notFound()
  const o = data.order
  const late = isOrderLate(o)
  const hub = o.ship_to
  return (
    <>
      <p>
        <Link href="/orders">← All orders</Link>
      </p>
      <div className="v-page-head">
        <h1>Order #{o.display_id}</h1>
        <span className="v-row">
          {late ? <Chip tone="late">Late</Chip> : null}
          <OrderChip status={o.status} />
        </span>
      </div>
      <div className="v-grid v-grid--2" style={{ alignItems: "start" }}>
        <section className="v-card" aria-labelledby="items-h">
          <h2 id="items-h">Items</h2>
          <ul className="v-list" data-testid="order-lines">
            {o.lines.map((l) => (
              <li key={l.id} className="v-row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: "var(--space-3)" }}>
                {l.thumbnail ? <Image className="v-line-thumb" src={l.thumbnail} alt="" width={64} height={80} unoptimized /> : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{l.product_title}</p>
                  <p className="v-small" style={{ margin: 0 }}>
                    {l.variant_title ? `${l.variant_title} · ` : ""}Qty {l.quantity}
                    {l.sku ? ` · SKU ${l.sku}` : ""}
                    {l.fulfilment_type === "made_to_order" ? " · Made to order" : ""}
                  </p>
                  {l.measurements ? (
                    <dl className="v-dl v-small" style={{ marginTop: "var(--space-2)" }} aria-label="Measurements for this item">
                      {Object.entries(l.measurements).map(([k, v]) => (
                        <div key={k} style={{ display: "contents" }}>
                          <dt>{MEASUREMENT_LABEL[k] ?? k}</dt>
                          <dd>{typeof v === "number" ? `${v} in` : v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
                <div className="v-small" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatMinor(l.vendor_price_minor, "USD")} each
                  <br />
                  <strong>{formatMinor(l.line_total_minor, "USD")}</strong>
                </div>
              </li>
            ))}
          </ul>
          <p style={{ textAlign: "right", marginTop: "var(--space-3)" }}>
            You receive <strong>{formatMinor(o.total_minor, "USD")}</strong>
          </p>
        </section>
        <div>
          <section className="v-card" aria-labelledby="ship-to-h">
            <h2 id="ship-to-h">Ship to the Haanta hub</h2>
            <address className="v-address" data-testid="ship-to">
              {hub.name}
              <br />
              {hub.address_1}
              {hub.address_2 ? (
                <>
                  <br />
                  {hub.address_2}
                </>
              ) : null}
              <br />
              {hub.city}, {hub.province} {hub.postal_code}
              <br />
              {hub.country_code.toUpperCase()}
              {hub.phone ? (
                <>
                  <br />
                  {hub.phone}
                </>
              ) : null}
            </address>
            <dl className="v-dl" style={{ marginTop: "var(--space-4)" }}>
              <dt>Placed</dt>
              <dd>{formatDate(o.created_at)}</dd>
              <dt>Ship by</dt>
              <dd style={late ? { color: "var(--color-danger)", fontWeight: 700 } : undefined}>
                {formatDate(o.ship_by)}
                {late ? " (late)" : ""}
              </dd>
              {o.tracking_number ? (
                <>
                  <dt>Tracking</dt>
                  <dd>
                    {CARRIERS.find((c) => c.value === o.tracking_carrier)?.label ?? o.tracking_carrier} {o.tracking_number}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>
          <section className="v-card" aria-labelledby="actions-h">
            <h2 id="actions-h">Next step</h2>
            <OrderActions orderId={o.id} status={o.status} />
          </section>
        </div>
      </div>
    </>
  )
}
