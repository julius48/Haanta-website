import { timingSafeEqual } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { handleOnce, rawBodyOf } from "../../../lib/webhooks"
import { recordDelivery } from "../../../lib/ledger-ops"
import { getMessenger } from "../../../lib/adapters"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

function tokenOk(given: unknown): boolean {
  const secret = process.env.SHIPENGINE_WEBHOOK_TOKEN
  if (!secret || typeof given !== "string") return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * ShipEngine tracking webhook (URL carries a secret token: /webhooks/shipengine?token=…).
 * A "delivered" event records delivery, which starts the return window for vendor payouts, and
 * emails the buyer.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!tokenOk((req.query as Record<string, unknown>).token)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }
  const body = JSON.parse(rawBodyOf(req as never)) as { resource_type?: string; data?: { tracking_number?: string; status_code?: string; actual_delivery_date?: string } }
  const tn = body.data?.tracking_number
  if (body.resource_type !== "API_TRACK" || !tn) {
    res.json({ received: true, outcome: "ignored" })
    return
  }
  const eventId = `${tn}:${body.data?.status_code ?? ""}`
  const outcome = await handleOnce(req.scope, "shipengine", eventId, body.resource_type, async () => {
    if (body.data?.status_code !== "DE") return "ignored"
    const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "order", fields: ["id", "display_id", "email", "fulfillments.labels.tracking_number"] })
    const order = data.find((o) => ((o.fulfillments as { labels?: { tracking_number?: string }[] }[] | undefined) ?? []).some((f) => (f.labels ?? []).some((l) => l.tracking_number === tn)))
    if (!order) return "ignored"
    const created = await recordDelivery(req.scope, order.id as string, body.data.actual_delivery_date ? new Date(body.data.actual_delivery_date) : new Date())
    if (created.length && typeof order.email === "string") {
      await getMessenger().send({ event: "Order Delivered", audience: "buyer", to: { email: order.email }, properties: { order_number: order.display_id } })
    }
    return "processed"
  })
  res.json({ received: true, outcome })
}
