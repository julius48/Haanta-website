import type { Metadata } from "next"
import { Chip } from "@/components/chips"
import { Stat } from "@/components/stat"
import { formatMinor } from "@/lib/money"
import { vendorGet } from "@/lib/server/session"
import { formatDate } from "@/lib/status"
import type { Earnings } from "@/lib/types"

export const metadata: Metadata = { title: "Earnings" }

const STATUS_LABEL = { pending: "Pending", payable: "Payable", paid: "Paid" } as const
const REASON_LABEL: Record<string, string> = { refund: "Refund", return: "Return", cancellation: "Cancellation" }

export default async function EarningsPage() {
  const data = await vendorGet<Earnings>("/vendor/earnings")
  const b = data.balance
  return (
    <>
      <h1>Earnings</h1>
      <p className="v-muted">
        Sales become payable once Haanta has delivered the order and the return window has passed. Haanta pays payable balances by bank transfer.
      </p>
      <section aria-label="Balances" className="v-grid v-grid--4" style={{ marginBottom: "var(--space-6)" }}>
        <Stat label="Pending" value={formatMinor(b.pending_minor, "USD")} testId="balance-pending" />
        <Stat label="Payable" value={formatMinor(b.payable_minor, "USD")} testId="balance-payable" />
        <Stat label="Paid" value={formatMinor(b.paid_minor, "USD")} testId="balance-paid" />
        <Stat label="Lifetime" value={formatMinor(b.lifetime_minor, "USD")} />
      </section>

      <section className="v-card" aria-labelledby="payouts-h">
        <h2 id="payouts-h">Payouts</h2>
        {data.payouts.length ? (
          <div className="v-table-wrap" tabIndex={0} role="region" aria-labelledby="payouts-h">
            <table className="v-table">
              <thead>
                <tr>
                  <th scope="col">Paid on</th>
                  <th scope="col">Bank reference</th>
                  <th scope="col" className="v-num">
                    Amount
                  </th>
                  <th scope="col">Statement</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{formatDate(p.paid_at)}</th>
                    <td>{p.bank_reference}</td>
                    <td className="v-num">{formatMinor(p.amount_minor, p.currency || "USD")}</td>
                    <td>
                      <span className="v-row">
                        <a className="h-btn h-btn--secondary v-btn-sm" href={`/earnings/statements/${encodeURIComponent(p.id)}?format=pdf`} download>
                          PDF<span className="h-sr-only"> statement for {formatDate(p.paid_at)}</span>
                        </a>
                        <a className="h-btn h-btn--secondary v-btn-sm" href={`/earnings/statements/${encodeURIComponent(p.id)}?format=csv`} download>
                          CSV<span className="h-sr-only"> statement for {formatDate(p.paid_at)}</span>
                        </a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="v-muted">No payouts yet.</p>
        )}
      </section>

      <section className="v-card" aria-labelledby="sales-h">
        <h2 id="sales-h">Every sale</h2>
        {data.entries.length ? (
          <div className="v-table-wrap" tabIndex={0} role="region" aria-labelledby="sales-h">
            <table className="v-table" data-testid="earnings-entries">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Order</th>
                  <th scope="col">Product</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="v-num">
                    Qty
                  </th>
                  <th scope="col" className="v-num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.created_at)}</td>
                    <td>#{e.order}</td>
                    <td>{e.product}</td>
                    <td>{e.type === "sale" ? "Sale" : (REASON_LABEL[e.reason ?? ""] ?? "Adjustment")}</td>
                    <td className="v-num">{e.quantity}</td>
                    <td className="v-num" style={e.amount_minor < 0 ? { color: "var(--color-danger)" } : undefined}>
                      {formatMinor(e.amount_minor, e.currency || "USD")}
                    </td>
                    <td>
                      <Chip tone={e.status}>{STATUS_LABEL[e.status]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="v-muted">No sales yet.</p>
        )}
      </section>
    </>
  )
}
