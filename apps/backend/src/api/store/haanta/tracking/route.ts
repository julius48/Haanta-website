import { timingSafeEqual } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import { getLabelsAndTracking } from "../../../../lib/adapters"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

const STAGE: Record<string, string> = {
  new: "Order received",
  accepted: "Being prepared by the designer",
  in_production: "In production",
  shipped_to_hub: "On its way to the Haanta hub",
  received_at_hub: "At the Haanta hub",
  cancelled: "Cancelled",
}

const sameEmail = (a: string, b: string) => {
  const x = Buffer.from(a.trim().toLowerCase())
  const y = Buffer.from(b.trim().toLowerCase())
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Order tracking by order number + email (rate limited). Returns status only: no address, name or
 * payment details. A wrong email gets the same "not found" as a wrong number.
 */
export async function POST(req: MedusaRequest<{ order_number: number; email: string }>, res: MedusaResponse) {
  const { order_number, email } = req.validatedBody
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "status", "created_at", "fulfillments.labels.tracking_number", "fulfillments.provider_id", "fulfillments.shipped_at", "fulfillments.delivered_at"],
    filters: { display_id: order_number },
  })
  const order = data[0]
  if (!order || typeof order.email !== "string" || !sameEmail(order.email, email)) {
    res.status(404).json({ type: "not_found", message: "We couldn't find an order with those details" })
    return
  }
  const vendorOrders = await req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVendorOrders({ order_id: order.id as string })
  const shipments = []
  for (const f of (order.fulfillments as { labels?: { tracking_number?: string }[]; shipped_at?: string | null; delivered_at?: string | null }[] | undefined) ?? []) {
    for (const l of f.labels ?? []) {
      if (!l.tracking_number) continue
      let events: unknown[] = []
      try {
        events = await getLabelsAndTracking().track("ups", l.tracking_number)
      } catch {
        events = []
      }
      shipments.push({ tracking_number: l.tracking_number, shipped_at: f.shipped_at ?? null, delivered_at: f.delivered_at ?? null, events })
    }
  }
  res.json({
    order_number: order.display_id,
    status: order.status,
    placed_at: order.created_at,
    stages: vendorOrders.map((v) => ({ stage: STAGE[v.status] ?? v.status, is_preorder: v.is_preorder, estimated_dispatch: v.ship_by })),
    shipments,
  })
}
