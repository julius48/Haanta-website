/** Size chart API shape ↔ editor shape (pure). */
import type { SizeChart } from "./types"

export interface SizeChartDraft {
  name: string
  unit: "in" | "cm"
  notes: string
  columns: string[]
  rows: { label: string; us: string; uk: string; eu: string; values: string[] }[]
}

export function emptySizeChart(): SizeChartDraft {
  const columns = ["bust", "waist", "hips"]
  return { name: "", unit: "in", notes: "", columns, rows: ["S", "M", "L"].map((label) => ({ label, us: "", uk: "", eu: "", values: columns.map(() => "") })) }
}

export function chartToDraft(c: SizeChart): SizeChartDraft {
  const columns: string[] = []
  for (const r of c.rows) for (const k of Object.keys(r.measurements ?? {})) if (!columns.includes(k)) columns.push(k)
  return {
    name: c.name,
    unit: c.unit,
    notes: c.notes ?? "",
    columns,
    rows: c.rows.map((r) => ({ label: r.label, us: r.us ?? "", uk: r.uk ?? "", eu: r.eu ?? "", values: columns.map((k) => r.measurements?.[k] ?? "") })),
  }
}
