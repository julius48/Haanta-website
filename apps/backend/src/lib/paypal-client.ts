/**
 * PayPal Orders v2 behind a small interface: live REST client when PAYPAL_CLIENT_ID is set,
 * in-memory mock otherwise. Money goes to Haanta's own PayPal business account.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export interface PayPalOrderLite {
  id: string
  status: "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | "PAYER_ACTION_REQUIRED"
  amount: string
  currency: string
  capture_id: string | null
}

export interface PayPalLike {
  mode: "live" | "mock"
  createOrder(input: { amount: string; currency: string; reference: string; requestId?: string }): Promise<PayPalOrderLite>
  getOrder(id: string): Promise<PayPalOrderLite>
  captureOrder(id: string, requestId?: string): Promise<PayPalOrderLite>
  refundCapture(captureId: string, amount: string, currency: string, requestId?: string): Promise<{ id: string; status: string }>
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<boolean>
  mockApprove?(id: string): void
}

function createLivePayPal(clientId: string, secret: string): PayPalLike {
  const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
  let token: { value: string; exp: number } | null = null
  async function auth(): Promise<string> {
    if (token && Date.now() < token.exp - 60_000) return token.value
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`)
    const d = (await res.json()) as { access_token: string; expires_in: number }
    token = { value: d.access_token, exp: Date.now() + d.expires_in * 1000 }
    return token.value
  }
  async function call<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await auth()}`, "content-type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`PayPal ${method} ${path} failed (${res.status})`)
    return (await res.json()) as T
  }
  type Raw = { id: string; status: PayPalOrderLite["status"]; purchase_units?: { amount?: { value: string; currency_code: string }; payments?: { captures?: { id: string }[] } }[] }
  const lite = (o: Raw): PayPalOrderLite => ({
    id: o.id,
    status: o.status,
    amount: o.purchase_units?.[0]?.amount?.value ?? "0",
    currency: o.purchase_units?.[0]?.amount?.currency_code ?? "USD",
    capture_id: o.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null,
  })
  return {
    mode: "live",
    async createOrder({ amount, currency, reference, requestId }) {
      return lite(await call<Raw>("POST", "/v2/checkout/orders", { intent: "CAPTURE", purchase_units: [{ reference_id: reference, amount: { currency_code: currency, value: amount } }] }, requestId))
    },
    async getOrder(id) {
      return lite(await call<Raw>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`))
    },
    async captureOrder(id, requestId) {
      return lite(await call<Raw>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, requestId))
    },
    async refundCapture(captureId, amount, currency, requestId) {
      const r = await call<{ id: string; status: string }>("POST", `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { amount: { value: amount, currency_code: currency } }, requestId)
      return { id: r.id, status: r.status }
    },
    async verifyWebhook(headers, rawBody) {
      const h = (k: string) => String(headers[k] ?? "")
      const result = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      })
      return result.verification_status === "SUCCESS"
    },
  }
}

const mockSecret = () => process.env.PAYPAL_MOCK_WEBHOOK_SECRET || "paypal-mock-webhook-secret"

export function signPayPalMockPayload(rawBody: string): string {
  return createHmac("sha256", mockSecret()).update(rawBody).digest("hex")
}

function createMockPayPal(): PayPalLike {
  const orders = new Map<string, PayPalOrderLite>()
  const get = (id: string) => {
    const o = orders.get(id)
    if (!o) throw new Error("PayPal order not found")
    return o
  }
  return {
    mode: "mock",
    async createOrder({ amount, currency }) {
      const id = `PPMOCK${randomBytes(6).toString("hex").toUpperCase()}`
      const o: PayPalOrderLite = { id, status: "CREATED", amount, currency, capture_id: null }
      orders.set(id, o)
      return { ...o }
    },
    async getOrder(id) {
      return { ...get(id) }
    },
    async captureOrder(id) {
      const o = get(id)
      if (o.status === "COMPLETED") return { ...o }
      if (o.status !== "APPROVED") throw new Error("Order not approved by payer")
      o.status = "COMPLETED"
      o.capture_id = `CAP${randomBytes(5).toString("hex").toUpperCase()}`
      return { ...o }
    },
    async refundCapture() {
      return { id: `REF${randomBytes(5).toString("hex").toUpperCase()}`, status: "COMPLETED" }
    },
    async verifyWebhook(headers, rawBody) {
      const given = Buffer.from(String(headers["paypal-mock-signature"] ?? ""))
      const expected = Buffer.from(signPayPalMockPayload(rawBody))
      return given.length === expected.length && timingSafeEqual(given, expected)
    },
    mockApprove(id) {
      get(id).status = "APPROVED"
    },
  }
}

let client: PayPalLike | null = null
export function getPayPal(): PayPalLike {
  if (client) return client
  const id = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  client = id && secret && !process.env.TEST_TYPE ? createLivePayPal(id, secret) : createMockPayPal()
  return client
}
