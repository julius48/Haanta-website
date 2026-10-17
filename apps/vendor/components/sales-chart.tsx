import { formatMinor } from "@/lib/money"

/** Fill missing days with zero so the chart shows a continuous range ending today (UTC). */
export function fillDays(rows: { date: string; amount_minor: number }[], days: number, today = new Date()): { date: string; amount_minor: number }[] {
  const byDate = new Map(rows.map((r) => [r.date, r.amount_minor]))
  const out: { date: string; amount_minor: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10)
    out.push({ date: d, amount_minor: byDate.get(d) ?? 0 })
  }
  return out
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))
}

/**
 * Single-series bar chart (net earnings per day) in Haanta Brown. The SVG has a text summary; each
 * bar has a hover tooltip (<title>); the same numbers are in a table below for screen readers.
 */
export function SalesChart({ data, currency = "USD" }: { data: { date: string; amount_minor: number }[]; currency?: string }) {
  const W = 720
  const H = 220
  const pad = { top: 16, right: 8, bottom: 28, left: 8 }
  const max = Math.max(1, ...data.map((d) => d.amount_minor))
  const total = data.reduce((s, d) => s + d.amount_minor, 0)
  const best = data.reduce((b, d) => (d.amount_minor > b.amount_minor ? d : b), data[0] ?? { date: "", amount_minor: 0 })
  const slot = (W - pad.left - pad.right) / Math.max(1, data.length)
  const barW = Math.max(2, slot - 2)
  const plotH = H - pad.top - pad.bottom
  const labelEvery = Math.ceil(data.length / 6)
  const summary = `Net earnings per day for the last ${data.length} days. Total ${formatMinor(total, currency)}.${best.amount_minor > 0 ? ` Best day ${shortDate(best.date)} with ${formatMinor(best.amount_minor, currency)}.` : " No sales yet."}`

  return (
    <figure className="v-chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} data-testid="sales-chart">
        <line className="v-chart__axis" x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} />
        {data.map((d, i) => {
          const h = d.amount_minor > 0 ? Math.max(2, (d.amount_minor / max) * plotH) : 0
          const x = pad.left + i * slot + 1
          const y = H - pad.bottom - h
          const r = Math.min(4, barW / 2, h)
          // Rounded data end (top), square baseline.
          const path = h > 0 ? `M${x},${H - pad.bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${H - pad.bottom} Z` : ""
          return (
            <g key={d.date}>
              {/* Full-height hit target so small bars are easy to hover. */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent">
                <title>{`${shortDate(d.date)}: ${formatMinor(d.amount_minor, currency)}`}</title>
              </rect>
              {path ? (
                <path className="v-chart__bar" d={path}>
                  <title>{`${shortDate(d.date)}: ${formatMinor(d.amount_minor, currency)}`}</title>
                </path>
              ) : null}
              {i % labelEvery === 0 ? (
                <text className="v-chart__label" x={x + barW / 2} y={H - 8} textAnchor="middle" aria-hidden="true">
                  {shortDate(d.date)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <figcaption className="v-small v-muted">{summary}</figcaption>
      <details style={{ marginTop: "var(--space-2)" }}>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Show the numbers as a table</summary>
        <div className="v-table-wrap" tabIndex={0} role="region" aria-label="Daily earnings table">
          <table className="v-table">
            <caption>Net earnings per day</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="v-num">
                  Earnings
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{shortDate(d.date)}</th>
                  <td className="v-num">{formatMinor(d.amount_minor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
