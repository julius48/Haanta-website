import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/fields"
import { getMe, vendorGet } from "@/lib/server/session"
import type { SizeChart } from "@/lib/types"

export const metadata: Metadata = { title: "Size charts" }

export default async function SizeChartsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const [me, data] = await Promise.all([getMe(), vendorGet<{ size_charts: SizeChart[] }>("/vendor/size-charts")])
  const canEdit = me?.vendor.status !== "paused" && me?.vendor.status !== "rejected"
  return (
    <>
      <div className="v-page-head">
        <h1>Size charts</h1>
        {canEdit ? (
          <Link href="/size-charts/new" className="h-btn h-btn--primary" data-testid="new-size-chart">
            New size chart
          </Link>
        ) : null}
      </div>
      <p className="v-muted">Buyers see your size chart on product pages. Attach a chart to each product in the product form.</p>
      {sp.saved ? <Alert tone="success" title="Size chart saved" /> : null}
      {sp.deleted ? <Alert tone="success" title="Size chart deleted" /> : null}
      {data.size_charts.length ? (
        <ul className="v-list v-card">
          {data.size_charts.map((c) => {
            const cols = [...new Set(c.rows.flatMap((r) => Object.keys(r.measurements ?? {})))]
            return (
              <li key={c.id} className="v-item">
                <Link className="v-item__title" href={`/size-charts/${c.id}`}>
                  {c.name}
                </Link>
                <span className="v-small v-muted">
                  {c.rows.length} size{c.rows.length === 1 ? "" : "s"} · {c.unit === "cm" ? "centimetres" : "inches"}
                  {cols.length ? ` · ${cols.join(", ")}` : ""}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="v-card">
          <p>No size charts yet.</p>
        </div>
      )}
    </>
  )
}
