import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import { audit, type AnyRequest } from "../../../../../lib/http"
import { getMessenger } from "../../../../../lib/adapters"
import { NEXT_STATUSES } from "../../../../../lib/vendor-orders"
import { marketplaceOf } from "../../../../../lib/vendor-onboarding"
import type { VendorOrderStatusBody } from "../../../../validators"

/** Vendor fulfilment progress: accepted → in production → shipped to hub (with tracking). */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof VendorOrderStatusBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const vo = await marketplace.getOwnVendorOrder(vc.vendor_id, req.params.id!)
  const b = req.validatedBody
  if (!NEXT_STATUSES[vo.status]?.includes(b.status)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Can't move an order from ${vo.status.replace(/_/g, " ")} to ${b.status.replace(/_/g, " ")}`)
  }
  const now = new Date()
  const updated = await marketplace.updateVendorOrders({
    id: vo.id,
    status: b.status,
    ...(b.status === "accepted" ? { accepted_at: now } : {}),
    ...(b.status === "shipped_to_hub" ? { shipped_at: now, tracking_number: b.tracking_number!, tracking_carrier: b.tracking_carrier! } : {}),
  })
  if (b.status === "shipped_to_hub") {
    await getMessenger().send({
      event: "Vendor Shipped To Hub",
      audience: "staff",
      to: { email: process.env.HAANTA_OPS_EMAIL || "ops@haanta.com" },
      properties: { vendor_order_id: vo.id, order: vo.display_id, tracking_number: b.tracking_number, carrier: b.tracking_carrier },
    })
  }
  await audit(r, { action: "vendor_order.status", entity_type: "vendor_order", entity_id: vo.id, before: { status: vo.status }, after: { status: b.status, tracking_number: b.tracking_number ?? null } })
  res.json({ order: { id: updated.id, status: updated.status, tracking_number: updated.tracking_number, tracking_carrier: updated.tracking_carrier } })
}
