import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import { audit, type AnyRequest } from "../../../../lib/http"
import { marketplaceOf } from "../../../../lib/vendor-onboarding"
import type { SizeChartBody } from "../../../validators"
import { cleanChart } from "../route"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  res.json({ size_chart: await marketplaceOf(req).getOwnSizeChart(vc.vendor_id, req.params.id!) })
}

export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof SizeChartBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const before = await marketplace.getOwnSizeChart(vc.vendor_id, req.params.id!)
  const data = cleanChart(req.validatedBody)
  const after = await marketplace.updateSizeCharts({ id: before.id, ...data, rows: data.rows as unknown as Record<string, unknown> })
  await audit(r, { action: "size_chart.updated", entity_type: "size_chart", entity_id: before.id, before, after: data })
  res.json({ size_chart: after })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const chart = await marketplace.getOwnSizeChart(vc.vendor_id, req.params.id!)
  await marketplace.softDeleteSizeCharts([chart.id])
  await audit(r, { action: "size_chart.deleted", entity_type: "size_chart", entity_id: chart.id, before: chart })
  res.json({ id: chart.id, deleted: true })
}
