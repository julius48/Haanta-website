import type { Metadata } from "next"
import Link from "next/link"
import { Chip, OrderChip } from "@/components/chips"
import { formatMinor } from "@/lib/money"
import { vendorGet } from "@/lib/server/session"
import { formatDate, isOrderLate, ORDER_TABS } from "@/lib/status"
import type { VendorOrder, VendorOrderStatus } from "@/lib/types"

export const metadata: Metadata = { title: "Orders" }

const VALID = new Set<string>(["new", "accepted", "in_production", "shipped_to_hub", "all"])

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const tab = typeof sp.status === "string" && VALID.has(sp.status) ? (sp.status as VendorOrderStatus | "all") : "new"
  const data = await vendorGet<{ orders: VendorOrder[]; count: number }>(`/vendor/orders?limit=100${tab === "all" ? "" : `&status=${tab}`}`)
  return (
    <>
      <div className="v-page-head">
        <div>
          <p className="v-eyebrow">Fulfilment</p>
          <h1>Orders</h1>
          <p className="v-page-head__lead">Ship every order to the Haanta hub by its ship-by date. Haanta handles delivery to the buyer.</p>
        </div>
      </div>
      <nav aria-label="Filter orders by status">
        <ul className="v-tabs">
          {ORDER_TABS.map((t) => (
            <li key={t.value}>
              <Link className="v-tab" href={`/orders?status=${t.value}`} aria-current={t.value === tab ? "page" : undefined}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {data.orders.length ? (
        <ul className="v-list v-card" data-testid="order-list">
          {data.orders.map((o) => {
            const late = isOrderLate(o)
            const units = o.lines.reduce((n, l) => n + l.quantity, 0)
            return (
              <li key={o.id} className={late ? "v-order v-order--late" : "v-order"}>
                <div className="v-item">
                  <Link className="v-item__title" href={`/orders/${o.id}`}>
                    Order #{o.display_id}
                  </Link>
                  <span className="v-row">
                    {late ? <Chip tone="late">Late</Chip> : null}
                    <OrderChip status={o.status} />
                  </span>
                </div>
                <p className="v-small v-muted" style={{ margin: "var(--space-1) 0 0" }}>
                  Placed {formatDate(o.created_at)} · {units} {units === 1 ? "item" : "items"} · {formatMinor(o.total_minor, "USD")}
                  {o.ship_by ? ` · ship by ${formatDate(o.ship_by)}` : ""}
                </p>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="v-card">
          <p>No orders here right now.</p>
        </div>
      )}
    </>
  )
}
