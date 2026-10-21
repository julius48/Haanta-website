import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/fields"
import { fillDays, SalesChart } from "@/components/sales-chart"
import { Stat } from "@/components/stat"
import { formatMinor } from "@/lib/money"
import { getMe, vendorGet } from "@/lib/server/session"
import { formatDate, ORDER_STATUS_LABEL } from "@/lib/status"
import type { Analytics, Earnings, VendorOrderStatus } from "@/lib/types"

export const metadata: Metadata = { title: "Dashboard" }

const DAYS = 30

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const [me, analytics, earnings] = await Promise.all([getMe(), vendorGet<Analytics>(`/vendor/analytics?days=${DAYS}`), vendorGet<Earnings>("/vendor/earnings")])
  const b = earnings.balance
  const firstName = me?.user.name.split(" ")[0]
  const salesTotal = analytics.sales_by_day.reduce((n, d) => n + d.amount_minor, 0)
  const attention = analytics.late_orders.length + analytics.low_stock.length
  return (
    <>
      <section className="v-welcome" aria-labelledby="welcome-h">
        <div>
          <p className="v-eyebrow">{me?.vendor.name}</p>
          <h1 id="welcome-h" className="v-welcome__title">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="v-welcome__lead">
            {analytics.open_orders
              ? `You have ${analytics.open_orders} open order${analytics.open_orders === 1 ? "" : "s"} to prepare for the Haanta hub.`
              : "No open orders right now. A good moment to add new pieces."}
          </p>
        </div>
        <div className="v-welcome__actions">
          <Link href="/orders" className="h-btn v-btn-light">
            View orders
          </Link>
          <Link href="/products/new" className="h-btn v-btn-ghost-light">
            Add a product
          </Link>
        </div>
      </section>

      {sp.verified ? <Alert tone="success" title="Email verified">Thank you. Your account is all set.</Alert> : null}
      {sp.blocked === "pending" ? (
        <Alert tone="warning" title="Not available yet">
          <p>That action needs Haanta to approve your store first.</p>
        </Alert>
      ) : null}
      {sp.blocked === "paused" ? (
        <Alert tone="warning" title="Your store is paused">
          <p>Only orders can be updated while your store is paused. Contact Haanta to reactivate it.</p>
        </Alert>
      ) : null}

      <section aria-labelledby="balance-h" className="v-kpis">
        <h2 id="balance-h" className="h-sr-only">
          Your balance and orders
        </h2>
        <Stat label="Open orders" value={String(analytics.open_orders)} note={analytics.late_orders.length ? `${analytics.late_orders.length} late` : "None late"} tone={analytics.late_orders.length ? "alert" : undefined} testId="open-orders" />
        <Stat label="Pending" value={formatMinor(b.pending_minor, "USD")} note="Awaiting delivery and the return window" />
        <Stat label="Payable" value={formatMinor(b.payable_minor, "USD")} note="In your next payout" />
        <Stat label="Paid to date" value={formatMinor(b.paid_minor, "USD")} note={<Link href="/earnings">Earnings and statements</Link>} />
      </section>

      <div className="v-dash">
        <section aria-labelledby="sales-h" className="v-card v-dash__sales">
          <div className="v-card__head">
            <h2 id="sales-h">Sales</h2>
            <p className="v-card__meta">
              {formatMinor(salesTotal, "USD")} · last {DAYS} days
            </p>
          </div>
          <SalesChart data={fillDays(analytics.sales_by_day, DAYS)} />
        </section>

        <section aria-labelledby="attention-h" className="v-card v-dash__attention">
          <div className="v-card__head">
            <h2 id="attention-h">Needs attention</h2>
            <p className="v-card__meta">{attention ? `${attention} item${attention === 1 ? "" : "s"}` : "All clear"}</p>
          </div>
          {attention ? (
            <ul className="v-list v-attention">
              {analytics.late_orders.map((o) => (
                <li key={o.id} className="v-item">
                  <Link className="v-item__title" href={`/orders/${o.id}`}>
                    Order #{o.display_id}
                  </Link>
                  <span className="v-small v-attention__late">
                    Late · {ORDER_STATUS_LABEL[o.status as VendorOrderStatus] ?? o.status} · ship by {formatDate(o.ship_by)}
                  </span>
                </li>
              ))}
              {analytics.low_stock.map((s) => (
                <li key={s.variant_id} className="v-item">
                  <span>{s.title}</span>
                  <span className={`v-small ${s.available <= 0 ? "v-attention__late" : "v-attention__low"}`}>{s.available <= 0 ? "Sold out" : `${s.available} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="v-empty">
              <p className="v-empty__title">Nothing needs you right now</p>
              <p className="v-muted v-small">No late orders, and every tracked piece has stock.</p>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="best-h" className="v-card">
        <div className="v-card__head">
          <h2 id="best-h">Best sellers</h2>
          <p className="v-card__meta">Last {DAYS} days</p>
        </div>
        {analytics.best_sellers.length ? (
          <div className="v-table-wrap" tabIndex={0} role="region" aria-labelledby="best-h">
            <table className="v-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col" className="v-num">
                    Units sold
                  </th>
                  <th scope="col" className="v-num">
                    Your earnings
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.best_sellers.map((p) => (
                  <tr key={p.product_id ?? p.title}>
                    <th scope="row">{p.title}</th>
                    <td className="v-num">{p.units}</td>
                    <td className="v-num">{formatMinor(p.earnings_minor, "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="v-empty">
            <p className="v-empty__title">No sales yet</p>
            <p className="v-muted v-small">Once your products are live, your best sellers show here.</p>
          </div>
        )}
      </section>
    </>
  )
}
