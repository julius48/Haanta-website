import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import { sanitizePlainText } from "@haanta/core"
import { audit, type AnyRequest } from "../../../lib/http"
import { marketplaceOf } from "../../../lib/vendor-onboarding"
import type { SizeChartBody } from "../../validators"

export function cleanChart(b: z.infer<typeof SizeChartBody>) {
  return {
    name: sanitizePlainText(b.name, 80),
    unit: b.unit,
    rows: b.rows.map((r) => ({
      label: sanitizePlainText(r.label, 30),
      us: r.us ? sanitizePlainText(r.us, 10) : undefined,
      uk: r.uk ? sanitizePlainText(r.uk, 10) : undefined,
      eu: r.eu ? sanitizePlainText(r.eu, 10) : undefined,
      measurements: Object.fromEntries(Object.entries(r.measurements).map(([k, v]) => [k.toLowerCase(), sanitizePlainText(v, 20)])),
    })),
    notes: b.notes ? sanitizePlainText(b.notes, 500) : null,
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const charts = await marketplaceOf(req).listSizeCharts({ vendor_id: vc.vendor_id })
  res.json({ size_charts: charts })
}

export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof SizeChartBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const data = cleanChart(req.validatedBody)
  const chart = await marketplaceOf(req).createSizeCharts({ ...data, rows: data.rows as unknown as Record<string, unknown>, vendor_id: vc.vendor_id } as never)
  await audit(r, { action: "size_chart.created", entity_type: "size_chart", entity_id: chart.id, after: data })
  res.status(201).json({ size_chart: chart })
}
