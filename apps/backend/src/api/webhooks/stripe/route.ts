import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { getStripe } from "../../../lib/stripe-client"
import { handleOnce } from "../../../lib/webhooks"
import { captureAlert } from "../../../lib/monitoring"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/**
 * Stripe webhook. Signature verified against the raw body (STRIPE_WEBHOOK_SECRET); each event id is
 * processed once. Payment events drive Medusa's payment workflow; Radar warnings flag the order.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let event
  try {
    event = getStripe().constructEvent(req.rawBody as Buffer, req.headers["stripe-signature"] as string | undefined)
  } catch {
    res.status(400).json({ message: "Invalid signature" })
    return
  }
  const obj = event.data.object as unknown as Record<string, unknown>
  const outcome = await handleOnce(req.scope, "stripe", event.id, event.type, async () => {
    const meta = (obj.metadata as Record<string, string> | undefined) ?? {}
    const amount = Number(obj.amount_received ?? obj.amount ?? 0) / 100
    switch (event.type) {
      case "payment_intent.succeeded":
        if (!meta.session_id) return "ignored"
        await processPaymentWorkflow(req.scope).run({ input: { action: "captured", data: { session_id: meta.session_id, amount } } })
        return "processed"
      case "payment_intent.amount_capturable_updated":
        if (!meta.session_id) return "ignored"
        await processPaymentWorkflow(req.scope).run({ input: { action: "authorized", data: { session_id: meta.session_id, amount } } })
        return "processed"
      case "payment_intent.payment_failed":
        captureAlert("payment_failed", { payment_intent: obj.id, code: (obj.last_payment_error as { code?: string } | undefined)?.code ?? null })
        return "processed"
      case "radar.early_fraud_warning.created":
      case "charge.dispute.created": {
        const pi = String(obj.payment_intent ?? "")
        await flagOrderForPaymentIntent(req, pi, event.type)
        captureAlert("high_risk_order", { payment_intent: pi, reason: event.type })
        return "processed"
      }
      default:
        return "ignored"
    }
  })
  res.json({ received: true, outcome })
}

async function flagOrderForPaymentIntent(req: MedusaRequest, paymentIntentId: string, reason: string) {
  if (!paymentIntentId) return
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "payment", fields: ["id", "data", "payment_collection.order.id", "payment_collection.order.metadata"] })
  const match = data.find((p) => (p.data as { id?: string } | null)?.id === paymentIntentId)
  const order = (match?.payment_collection as { order?: { id: string; metadata?: Record<string, unknown> | null } } | undefined)?.order
  if (!order) return
  await req.scope.resolve<IOrderModuleService>(Modules.ORDER).updateOrders(order.id, { metadata: { ...(order.metadata ?? {}), haanta_risk_review: true, haanta_risk_reason: reason } })
}
