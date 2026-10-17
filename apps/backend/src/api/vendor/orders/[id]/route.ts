import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../../lib/http"
import { buildVendorOrderViews } from "../../../../lib/vendor-orders"
import { marketplaceOf } from "../../../../lib/vendor-onboarding"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const vo = await marketplaceOf(req).getOwnVendorOrder(vc.vendor_id, req.params.id!)
  const [view] = await buildVendorOrderViews(req, vc.vendor_id, [vo as unknown as Record<string, unknown>])
  res.json({ order: { ...view, ship_by: vo.ship_by } })
}
