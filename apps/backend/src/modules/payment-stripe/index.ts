import { AbstractPaymentProvider, MedusaError, ModuleProvider, Modules, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { getStripe, toStripeAmount, type PaymentIntentLite } from "../../lib/stripe-client"

/**
 * Stripe Payment Element provider. All money goes to Haanta's own Stripe account (no Connect).
 * Card data never touches our servers: the browser confirms the PaymentIntent with Stripe.js.
 */
class HaantaStripeProvider extends AbstractPaymentProvider<Record<string, unknown>> {
  static identifier = "stripe"

  // Public constructor so ModuleProvider can instantiate the provider.
  constructor(container: Record<string, unknown>, options: Record<string, unknown>) {
    super(container, options)
  }

  private intentId(data: Record<string, unknown> | undefined): string {
    const id = data?.id
    if (typeof id !== "string" || !id.startsWith("pi_")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing PaymentIntent id")
    return id
  }

  private status(pi: PaymentIntentLite): PaymentSessionStatus {
    switch (pi.status) {
      case "succeeded":
        return PaymentSessionStatus.CAPTURED
      case "requires_capture":
        return PaymentSessionStatus.AUTHORIZED
      case "processing":
        return PaymentSessionStatus.PENDING
      case "requires_action":
      case "requires_confirmation":
        return PaymentSessionStatus.REQUIRES_MORE
      case "canceled":
        return PaymentSessionStatus.CANCELED
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  private data(pi: PaymentIntentLite): Record<string, unknown> {
    return {
      id: pi.id,
      client_secret: pi.client_secret,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      risk_level: pi.latest_charge?.outcome?.risk_level ?? null,
      risk_score: pi.latest_charge?.outcome?.risk_score ?? null,
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const pi = await getStripe().createIntent({
      amount: toStripeAmount(input.amount),
      currency: input.currency_code.toLowerCase(),
      metadata: { session_id: String(input.data?.session_id ?? "") },
      idempotencyKey: input.context?.idempotency_key,
      customerEmail: input.context?.customer?.email,
    })
    return { id: pi.id, data: this.data(pi), status: this.status(pi) }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const pi = await getStripe().retrieveIntent(this.intentId(input.data))
    const status = this.status(pi)
    if (status === PaymentSessionStatus.PENDING && pi.status === "requires_payment_method") {
      return { status: PaymentSessionStatus.ERROR, data: this.data(pi) }
    }
    return { status, data: this.data(pi) }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const pi = await getStripe().captureIntent(this.intentId(input.data))
    return { data: this.data(pi) }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const pi = await getStripe().retrieveIntent(this.intentId(input.data))
    if (pi.status === "canceled" || pi.status === "succeeded") return { data: this.data(pi) }
    return { data: this.data(await getStripe().cancelIntent(pi.id)) }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input)
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const pi = await getStripe().retrieveIntent(this.intentId(input.data))
    return { status: this.status(pi), data: this.data(pi) }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const id = this.intentId(input.data)
    const refund = await getStripe().refund({ paymentIntentId: id, amount: toStripeAmount(input.amount) })
    return { data: { ...input.data, last_refund_id: refund.id } }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: this.data(await getStripe().retrieveIntent(this.intentId(input.data))) }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const pi = await getStripe().updateIntent(this.intentId(input.data), {
      amount: toStripeAmount(input.amount),
      currency: input.currency_code.toLowerCase(),
    })
    return { data: this.data(pi), status: this.status(pi) }
  }

  /**
   * Medusa's built-in /hooks/payment/stripe_stripe route. Signatures are verified here too, but
   * Haanta's /webhooks/stripe route is the configured endpoint (idempotency + Radar review).
   */
  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    let event
    try {
      event = getStripe().constructEvent(payload.rawData as Buffer, payload.headers["stripe-signature"] as string | undefined)
    } catch {
      return { action: "not_supported" }
    }
    const pi = event.data.object as { metadata?: Record<string, string>; amount_received?: number; amount?: number }
    const session_id = pi.metadata?.session_id
    if (!session_id) return { action: "not_supported" }
    const amount = (pi.amount_received ?? pi.amount ?? 0) / 100
    switch (event.type) {
      case "payment_intent.succeeded":
        return { action: "captured", data: { session_id, amount } }
      case "payment_intent.amount_capturable_updated":
        return { action: "authorized", data: { session_id, amount } }
      case "payment_intent.payment_failed":
        return { action: "failed", data: { session_id, amount } }
      default:
        return { action: "not_supported" }
    }
  }
}

export default ModuleProvider(Modules.PAYMENT, { services: [HaantaStripeProvider] })
