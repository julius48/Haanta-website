import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStripe } from "../../../../../lib/stripe-client"
import { getPayPal } from "../../../../../lib/paypal-client"

/**
 * Local development only: stands in for the browser confirming a payment with Stripe.js / PayPal
 * when no keys are configured. Disabled in production and whenever real Stripe/PayPal keys are set.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const stripe = getStripe()
  const paypal = getPayPal()
  if (process.env.NODE_ENV === "production" || (stripe.mode !== "mock" && paypal.mode !== "mock")) {
    res.status(404).json({ message: "Not found" })
    return
  }
  const body = (req.body ?? {}) as { payment_intent_id?: unknown; payment_method?: unknown; paypal_order_id?: unknown }
  if (typeof body.payment_intent_id === "string" && /^pi_mock_[a-f0-9]{16}$/.test(body.payment_intent_id) && stripe.mockConfirm) {
    const pm = typeof body.payment_method === "string" && /^pm_[A-Za-z]{2,40}$/.test(body.payment_method) ? body.payment_method : "pm_card_visa"
    const pi = stripe.mockConfirm(body.payment_intent_id, pm)
    res.json({ status: pi.status })
    return
  }
  if (typeof body.paypal_order_id === "string" && /^PPMOCK[A-F0-9]{12}$/.test(body.paypal_order_id) && paypal.mockApprove) {
    paypal.mockApprove(body.paypal_order_id)
    res.json({ status: "APPROVED" })
    return
  }
  res.status(400).json({ message: "Unknown mock payment" })
}
