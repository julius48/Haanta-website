import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPayPal } from "../../../lib/paypal-client"
import { handleOnce, rawBodyOf } from "../../../lib/webhooks"
import { captureAlert } from "../../../lib/monitoring"

/** PayPal webhook: signature verified with PayPal's verify API (mock: HMAC); processed once per event id. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const raw = rawBodyOf(req as never)
  const valid = await getPayPal()
    .verifyWebhook(req.headers as Record<string, string | string[] | undefined>, raw)
    .catch(() => false)
  if (!valid) {
    res.status(400).json({ message: "Invalid signature" })
    return
  }
  const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> }
  if (!event.id || !event.event_type) {
    res.status(400).json({ message: "Malformed event" })
    return
  }
  const outcome = await handleOnce(req.scope, "paypal", event.id, event.event_type, async () => {
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.DENIED":
      case "PAYMENT.CAPTURE.DECLINED":
        captureAlert("payment_failed", { provider: "paypal", resource: event.resource?.id ?? null })
        return "processed"
      case "CUSTOMER.DISPUTE.CREATED":
        captureAlert("high_risk_order", { provider: "paypal", dispute: event.resource?.dispute_id ?? null })
        return "processed"
      case "PAYMENT.CAPTURE.COMPLETED":
        // Capture happens synchronously at checkout; nothing further to do.
        return "processed"
      default:
        return "ignored"
    }
  })
  res.json({ received: true, outcome })
}
