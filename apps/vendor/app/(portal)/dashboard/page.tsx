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
  return (
    <>
      <div className="v-page-head">
        <div>
          <h1>Hello{me ? `, ${me.user.name.split(" ")[0]}` : ""}</h1>
          <p className="v-muted" style={{ margin: 0 }}>
            {me?.vendor.name} · last {DAYS} days
          </p>
        </div>
      </div>
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

      <section aria-labelledby="balance-h" className="v-card">
        <h2 id="balance-h">Your balance</h2>
        <div className="v-grid v-grid--3">
          <Stat label="Pending (awaiting delivery and return window)" value={formatMinor(b.pending_minor, "USD")} />
          <Stat label="Payable (next payout)" value={formatMinor(b.payable_minor, "USD")} />
          <Stat label="Paid to date" value={formatMinor(b.paid_minor, "USD")} />
        </div>
        <p style={{ marginTop: "var(--space-4)" }}>
          <Link href="/earnings">See all earnings and statements</Link>
        </p>
      </section>

      <div className="v-grid v-grid--2">
        <section aria-labelledby="orders-h" className="v-card">
          <h2 id="orders-h">Orders to fulfil</h2>
          <p>
            <strong className="v-stat__value" data-testid="open-orders">
              {analytics.open_orders}
            </strong>{" "}
            open order{analytics.open_orders === 1 ? "" : "s"}
          </p>
          {analytics.late_orders.length ? (
            <>
              <h3 style={{ color: "var(--color-danger)" }}>Late — ship these first</h3>
              <ul className="v-list">
                {analytics.late_orders.map((o) => (
                  <li key={o.id} className="v-item">
                    <Link className="v-item__title" href={`/orders/${o.id}`}>
                      Order #{o.display_id}
                    </Link>
                    <span className="v-small">
                      {ORDER_STATUS_LABEL[o.status as VendorOrderStatus] ?? o.status} · ship by {formatDate(o.ship_by)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="v-muted">No late orders. </p>
          )}
          <Link href="/orders" className="h-btn h-btn--secondary">
            Go to orders
          </Link>
        </section>

        <section aria-labelledby="stock-h" className="v-card">
          <h2 id="stock-h">Low stock</h2>
          {analytics.low_stock.length ? (
            <ul className="v-list">
              {analytics.low_stock.map((s) => (
                <li key={s.variant_id} className="v-item">
                  <span>{s.title}</span>
                  <strong style={{ color: s.available <= 0 ? "var(--color-danger)" : "var(--color-warning)" }}>{s.available <= 0 ? "Sold out" : `${s.available} left`}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="v-muted">All tracked products have enough stock.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="sales-h" className="v-card">
        <h2 id="sales-h">Sales</h2>
        <SalesChart data={fillDays(analytics.sales_by_day, DAYS)} />
      </section>

      <section aria-labelledby="best-h" className="v-card">
        <h2 id="best-h">Best sellers</h2>
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
          <p className="v-muted">No sales yet. Once your products are live, your best sellers show here.</p>
        )}
      </section>
    </>
  )
}

