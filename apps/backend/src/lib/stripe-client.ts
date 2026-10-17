/**
 * Stripe access behind a small interface. With STRIPE_API_KEY the real SDK is used; otherwise an
 * in-memory mock that follows Stripe test-mode semantics (test payment method ids) so checkout runs
 * end to end with no keys. Webhook signatures always use the real SDK's verifier (works offline).
 */
import Stripe from "stripe"
import { randomBytes } from "node:crypto"

export type RiskLevel = "normal" | "elevated" | "highest" | "not_assessed" | "unknown"

export interface PaymentIntentLite {
  id: string
  client_secret: string | null
  amount: number
  currency: string
  status: "requires_payment_method" | "requires_confirmation" | "requires_action" | "processing" | "requires_capture" | "canceled" | "succeeded"
  latest_charge: { id: string; outcome: { risk_level: RiskLevel; risk_score?: number | null } | null } | null
  metadata: Record<string, string>
}

export interface StripeLike {
  mode: "live" | "mock"
  createIntent(input: { amount: number; currency: string; metadata: Record<string, string>; idempotencyKey?: string; customerEmail?: string }): Promise<PaymentIntentLite>
  retrieveIntent(id: string): Promise<PaymentIntentLite>
  updateIntent(id: string, input: { amount: number; currency: string }): Promise<PaymentIntentLite>
  cancelIntent(id: string): Promise<PaymentIntentLite>
  captureIntent(id: string): Promise<PaymentIntentLite>
  refund(input: { paymentIntentId: string; amount: number; idempotencyKey?: string }): Promise<{ id: string; status: string }>
  /** Verifies the Stripe-Signature header against the raw body. Throws on mismatch. */
  constructEvent(rawBody: string | Buffer, signature: string | undefined): Stripe.Event
  /** Test helper: confirm a mock intent with a Stripe test payment method id. */
  mockConfirm?(id: string, paymentMethod: string): PaymentIntentLite
}

const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || "whsec_local_test_secret"

function verifier() {
  // Offline signature verification; the API key is not used for this.
  return new Stripe("sk_test_offline_verifier_only")
}

function toLite(pi: Stripe.PaymentIntent): PaymentIntentLite {
  const charge = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null
  return {
    id: pi.id,
    client_secret: pi.client_secret,
    amount: pi.amount,
    currency: pi.currency,
    status: pi.status,
    latest_charge: charge ? { id: charge.id, outcome: charge.outcome ? { risk_level: (charge.outcome.risk_level ?? "unknown") as RiskLevel, risk_score: charge.outcome.risk_score ?? null } : null } : null,
    metadata: pi.metadata ?? {},
  }
}

function createLiveStripe(apiKey: string): StripeLike {
  const stripe = new Stripe(apiKey, { maxNetworkRetries: 2, timeout: 20000 })
  const expand = ["latest_charge"]
  return {
    mode: "live",
    async createIntent({ amount, currency, metadata, idempotencyKey, customerEmail }) {
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          currency,
          metadata,
          // Payment Element: cards, Apple Pay, Google Pay, Link, Klarna (enabled in the Stripe dashboard).
          automatic_payment_methods: { enabled: true },
          receipt_email: customerEmail,
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      )
      return toLite(pi)
    },
    async retrieveIntent(id) {
      return toLite(await stripe.paymentIntents.retrieve(id, { expand }))
    },
    async updateIntent(id, { amount, currency }) {
      return toLite(await stripe.paymentIntents.update(id, { amount, currency }))
    },
    async cancelIntent(id) {
      return toLite(await stripe.paymentIntents.cancel(id))
    },
    async captureIntent(id) {
      return toLite(await stripe.paymentIntents.capture(id, { expand }))
    },
    async refund({ paymentIntentId, amount, idempotencyKey }) {
      const r = await stripe.refunds.create({ payment_intent: paymentIntentId, amount }, idempotencyKey ? { idempotencyKey } : undefined)
      return { id: r.id, status: r.status ?? "pending" }
    },
    constructEvent(raw, sig) {
      if (!sig) throw new Error("Missing Stripe-Signature header")
      return stripe.webhooks.constructEvent(raw, sig, webhookSecret())
    },
  }
}

/** Test payment methods, mirroring Stripe's test cards. */
const MOCK_OUTCOMES: Record<string, { status: PaymentIntentLite["status"]; risk: RiskLevel }> = {
  pm_card_visa: { status: "succeeded", risk: "normal" },
  pm_card_mastercard: { status: "succeeded", risk: "normal" },
  pm_card_riskLevelElevated: { status: "succeeded", risk: "elevated" },
  pm_card_riskLevelHighest: { status: "canceled", risk: "highest" },
  pm_card_chargeDeclined: { status: "requires_payment_method", risk: "normal" },
  pm_card_authenticationRequired: { status: "requires_action", risk: "normal" },
  pm_klarna: { status: "processing", risk: "normal" },
}

function createMockStripe(): StripeLike {
  const intents = new Map<string, PaymentIntentLite>()
  const get = (id: string) => {
    const pi = intents.get(id)
    if (!pi) throw new Error(`No such payment_intent: '${id}'`)
    return pi
  }
  return {
    mode: "mock",
    async createIntent({ amount, currency, metadata }) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid amount")
      const id = `pi_mock_${randomBytes(8).toString("hex")}`
      const pi: PaymentIntentLite = { id, client_secret: `${id}_secret_${randomBytes(8).toString("hex")}`, amount, currency, status: "requires_payment_method", latest_charge: null, metadata }
      intents.set(id, pi)
      return { ...pi }
    },
    async retrieveIntent(id) {
      return { ...get(id) }
    },
    async updateIntent(id, { amount, currency }) {
      const pi = get(id)
      if (pi.status === "succeeded") throw new Error("Cannot update a succeeded PaymentIntent")
      Object.assign(pi, { amount, currency })
      return { ...pi }
    },
    async cancelIntent(id) {
      const pi = get(id)
      pi.status = "canceled"
      return { ...pi }
    },
    async captureIntent(id) {
      const pi = get(id)
      if (pi.status === "requires_capture") pi.status = "succeeded"
      return { ...pi }
    },
    async refund({ paymentIntentId }) {
      const pi = get(paymentIntentId)
      if (pi.status !== "succeeded") throw new Error("Charge not captured")
      return { id: `re_mock_${randomBytes(6).toString("hex")}`, status: "succeeded" }
    },
    constructEvent(raw, sig) {
      if (!sig) throw new Error("Missing Stripe-Signature header")
      return verifier().webhooks.constructEvent(raw, sig, webhookSecret())
    },
    mockConfirm(id, paymentMethod) {
      const pi = get(id)
      const outcome = MOCK_OUTCOMES[paymentMethod] ?? MOCK_OUTCOMES.pm_card_visa!
      pi.status = outcome.status
      pi.latest_charge = { id: `ch_mock_${randomBytes(6).toString("hex")}`, outcome: { risk_level: outcome.risk, risk_score: outcome.risk === "elevated" ? 70 : outcome.risk === "highest" ? 90 : 20 } }
      return { ...pi }
    },
  }
}

let client: StripeLike | null = null
export function getStripe(): StripeLike {
  if (client) return client
  const key = process.env.STRIPE_API_KEY
  client = key && !process.env.TEST_TYPE ? createLiveStripe(key) : createMockStripe()
  return client
}

/** Build a signed webhook header the same way Stripe does (tests and local tooling). */
export function signStripePayload(payload: string): string {
  return verifier().webhooks.generateTestHeaderString({ payload, secret: webhookSecret() })
}

/** Stripe amounts are in minor units; USD and CAD have 2 decimals. */
export function toStripeAmount(amount: number | string | { toString(): string }): number {
  return Math.round(Number(String(amount)) * 100)
}
