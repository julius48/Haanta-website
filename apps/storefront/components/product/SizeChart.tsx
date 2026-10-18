"use client"

import { useState } from "react"
import { Dialog } from "@/components/ui/Dialog"
import { HOW_TO_MEASURE, STANDARD_SIZE_CHARTS, type SizeChartData } from "@/lib/size-chart"

const heading = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase())

function ChartTable({ chart, title }: { chart: SizeChartData; title: string }) {
  const measureKeys = [...new Set(chart.rows.flatMap((r) => Object.keys(r.measurements ?? {})))]
  const unit = chart.unit === "cm" ? "centimetres" : "inches"
  return (
    <section className="s-size-chart">
      <h3 className="s-size-chart__title">{title}</h3>
      <div className="s-table-wrap" tabIndex={0} role="region" aria-label={`${title} size table`}>
        <table className="s-table">
          <caption className="h-sr-only">
            {title}: sizes with US and UK equivalents and body measurements in {unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">US</th>
              <th scope="col">UK</th>
              {measureKeys.map((k) => (
                <th scope="col" key={k}>
                  {heading(k)} ({chart.unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.us ?? "–"}</td>
                <td>{r.uk ?? "–"}</td>
                {measureKeys.map((k) => (
                  <td key={k}>{r.measurements?.[k] ?? "–"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chart.notes ? <p className="s-small">{chart.notes}</p> : null}
    </section>
  )
}

/**
 * Size guide on every product page: the designer's own chart when they have one, then the Haanta
 * standard guide (women and men) and how to measure. Accessible dialog with scrollable tables.
 */
export function SizeChart({ chart, brand, sizeNotes, fitNotes }: { chart: SizeChartData | null; brand: string; sizeNotes: string | null; fitNotes: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="s-link-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid="size-chart-button">
        Size guide
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={chart ? `${brand} size guide` : "Size guide"} size="lg" testId="size-chart">
        {fitNotes ? <p className="s-fit-note">{fitNotes}</p> : null}
        {sizeNotes ? <p className="s-fit-note">{sizeNotes}</p> : null}
        {chart ? (
          <ChartTable chart={chart} title={`${brand}: ${chart.name}`} />
        ) : (
          <p className="s-small s-muted">
            {brand} follows Haanta standard sizing. Between sizes? Add your measurements under Custom sizing and the designer will adjust the fit.
          </p>
        )}
        {STANDARD_SIZE_CHARTS.map((c) => (
          <ChartTable key={c.name} chart={c} title={chart ? `Haanta standard sizing: ${c.name}` : c.name} />
        ))}
        <section className="s-size-chart">
          <h3 className="s-size-chart__title">How to measure</h3>
          <dl className="s-howto">
            {HOW_TO_MEASURE.map((h) => (
              <div key={h.part}>
                <dt>{h.part}</dt>
                <dd>{h.how}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Dialog>
    </>
  )
}
