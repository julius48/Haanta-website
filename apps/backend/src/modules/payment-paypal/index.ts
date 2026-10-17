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
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { getPayPal, type PayPalOrderLite } from "../../lib/paypal-client"

const money = (amount: unknown) => Number(String(amount)).toFixed(2)

class HaantaPayPalProvider extends AbstractPaymentProvider<Record<string, unknown>> {
  static identifier = "paypal"

  // Public constructor so ModuleProvider can instantiate the provider.
  constructor(container: Record<string, unknown>, options: Record<string, unknown>) {
    super(container, options)
  }

  private orderId(data: Record<string, unknown> | undefined): string {
    const id = data?.id
    if (typeof id !== "string" || !/^[A-Z0-9]{5,40}$/i.test(id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing PayPal order id")
    return id
  }

  private status(o: PayPalOrderLite): PaymentSessionStatus {
    if (o.status === "COMPLETED") return PaymentSessionStatus.CAPTURED
    if (o.status === "APPROVED") return PaymentSessionStatus.AUTHORIZED
    if (o.status === "VOIDED") return PaymentSessionStatus.CANCELED
    if (o.status === "PAYER_ACTION_REQUIRED") return PaymentSessionStatus.REQUIRES_MORE
    return PaymentSessionStatus.PENDING
  }

  private data(o: PayPalOrderLite) {
    return { id: o.id, status: o.status, amount: o.amount, currency: o.currency, capture_id: o.capture_id }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const o = await getPayPal().createOrder({
      amount: money(input.amount),
      currency: input.currency_code.toUpperCase(),
      reference: String(input.data?.session_id ?? "haanta"),
      requestId: input.context?.idempotency_key,
    })
    return { id: o.id, data: this.data(o), status: this.status(o) }
  }

  /** The payer approved in the PayPal popup; capture now (funds settle to Haanta's account). */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const id = this.orderId(input.data)
    const current = await getPayPal().getOrder(id)
    if (current.status === "CREATED") return { status: PaymentSessionStatus.REQUIRES_MORE, data: this.data(current) }
    const o = current.status === "COMPLETED" ? current : await getPayPal().captureOrder(id, `capture-${id}`)
    return { status: this.status(o), data: this.data(o) }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...(input.data ?? {}), status: "VOIDED" } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const o = await getPayPal().getOrder(this.orderId(input.data))
    return { status: this.status(o), data: this.data(o) }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const captureId = input.data?.capture_id
    if (typeof captureId !== "string") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "PayPal payment was not captured")
    const r = await getPayPal().refundCapture(captureId, money(input.amount), String(input.data?.currency ?? "USD"))
    return { data: { ...input.data, last_refund_id: r.id } }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: this.data(await getPayPal().getOrder(this.orderId(input.data))) }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // PayPal orders are immutable once created; create a new one for the new amount.
    const o = await getPayPal().createOrder({ amount: money(input.amount), currency: input.currency_code.toUpperCase(), reference: "haanta" })
    return { data: this.data(o), status: this.status(o) }
  }

  async getWebhookActionAndData(): Promise<WebhookActionResult> {
    // PayPal webhooks are handled by Haanta's /webhooks/paypal route (signature verified there).
    return { action: "not_supported" }
  }
}

export default ModuleProvider(Modules.PAYMENT, { services: [HaantaPayPalProvider] })
