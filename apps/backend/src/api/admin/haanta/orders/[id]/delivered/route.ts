import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { loadOrder, recordDelivery } from "../../../../../../lib/ledger-ops"
import { getMessenger } from "../../../../../../lib/adapters"

/** Mark an order (or one vendor's part) delivered. Starts the return window for vendor payouts. */
export async function POST(req: AuthenticatedMedusaRequest<{ vendor_id?: string; delivered_at?: Date }>, res: MedusaResponse) {
  const deliveredAt = req.validatedBody.delivered_at ?? new Date()
  const order = await loadOrder(req.scope, req.params.id!)
  const created = await recordDelivery(req.scope, order.id as string, deliveredAt, req.validatedBody.vendor_id)
  if (created.length && typeof order.email === "string") {
    await getMessenger().send({ event: "Order Delivered", audience: "buyer", to: { email: order.email }, properties: { order_number: order.display_id } })
  }
  await audit(req as unknown as AnyRequest, { action: "order.delivered", entity_type: "order", entity_id: order.id as string, after: { delivered_at: deliveredAt, vendor_id: req.validatedBody.vendor_id ?? null, records: created.length } })
  res.json({ delivery_records: created.length })
}
