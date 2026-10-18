"use server"

import { cookies } from "next/headers"
import { refresh } from "next/cache"
import { z } from "zod"
import { ApiError, COOKIE, medusa, secureCookie } from "@/lib/server/medusa"
import { errorMessage } from "@/lib/server/errors"
import { EXTRA_COOKIE, getCartId, retrieveCart } from "@/lib/server/cart"
import { listRegions, regionForCountry } from "@/lib/server/region"
import type { Cart, Order, ShippingQuote } from "@/lib/types"

const POSTAL: Record<"us" | "ca" | "mx", RegExp> = {
  us: /^\d{5}(-\d{4})?$/,
  ca: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  mx: /^\d{5}$/,
}

const AddressSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    first_name: z.string().trim().min(1, "Enter your first name").max(80),
    last_name: z.string().trim().min(1, "Enter your last name").max(80),
    address_1: z.string().trim().min(3, "Enter your street address").max(120),
    address_2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1, "Enter your city").max(80),
    province: z.string().trim().min(2, "Enter your state or province").max(40),
    postal_code: z.string().trim().max(12),
    country_code: z.enum(["us", "ca", "mx"], { message: "Choose a country" }),
    phone: z.string().trim().min(7, "Enter a phone number for the courier").max(30).regex(/^[+0-9 ()-]+$/, "Enter a valid phone number"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!POSTAL[v.country_code].test(v.postal_code)) ctx.addIssue({ code: "custom", path: ["postal_code"], message: "Enter a valid postal code" })
  })

export type AddressInput = z.input<typeof AddressSchema>

type Fail = { ok: false; message: string; fieldErrors?: Record<string, string> }

async function requireCart(): Promise<string | Fail> {
  const id = await getCartId()
  return id ?? { ok: false, message: "Your bag has expired. Please add your items again." }
}

export async function submitAddressAction(input: AddressInput): Promise<{ ok: true; quote: ShippingQuote } | Fail> {
  const parsed = AddressSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors }
  }
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  const { email, ...rest } = parsed.data
  const address = { ...rest, province: rest.province.toUpperCase(), postal_code: rest.postal_code.toUpperCase(), address_2: rest.address_2 || undefined }
  try {
    const cart = await retrieveCart(cartId)
    const region = regionForCountry(await listRegions(), address.country_code)
    if (!region) return { ok: false, message: "We don't ship to that country yet." }
    if (cart.region_id !== region.id) {
      await medusa(`/store/carts/${cartId}`, { method: "POST", body: { region_id: region.id } })
      ;(await cookies()).set(COOKIE.country, address.country_code, secureCookie(60 * 60 * 24 * 365))
    }
    await medusa(`/store/carts/${cartId}`, { method: "POST", body: { email, shipping_address: address, billing_address: address } })
    const quote = await medusa<ShippingQuote>(`/store/carts/${cartId}/shipping-quotes`, { method: "POST", body: {} })
    refresh()
    return { ok: true, quote }
  } catch (e) {
    return { ok: false, message: errorMessage(e, "We couldn't get shipping options. Please try again.") }
  }
}

const ShippingSchema = z.object({ option_id: z.string().regex(/^[A-Za-z0-9_]+$/), quote_code: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) }).strict()

export type PaymentInit = { provider: "stripe"; client_secret: string | null } | { provider: "mock" }

async function stripeSession(cartId: string): Promise<{ id: string; client_secret: string | null }> {
  const { payment_collection } = await medusa<{ payment_collection: { id: string } }>("/store/payment-collections", { method: "POST", body: { cart_id: cartId } })
  const res = await medusa<{ payment_collection: { payment_sessions?: { provider_id: string; data?: Record<string, unknown> | null }[] } }>(
    `/store/payment-collections/${payment_collection.id}/payment-sessions`,
    { method: "POST", body: { provider_id: "pp_stripe_stripe" } },
  )
  const s = (res.payment_collection.payment_sessions ?? []).find((x) => x.provider_id === "pp_stripe_stripe")
  const id = typeof s?.data?.id === "string" ? s.data.id : ""
  const secret = typeof s?.data?.client_secret === "string" ? s.data.client_secret : null
  return { id, client_secret: secret }
}

export async function selectShippingAction(input: { option_id: string; quote_code: string }): Promise<{ ok: true; payment: PaymentInit } | Fail> {
  const parsed = ShippingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: "Choose a delivery option." }
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  try {
    await medusa(`/store/carts/${cartId}/shipping-methods`, { method: "POST", body: { option_id: parsed.data.option_id, data: { quote_code: parsed.data.quote_code } } })
    const session = await stripeSession(cartId)
    refresh()
    // The client secret is only needed (and only sent) when Stripe.js is configured in the browser.
    if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return { ok: true, payment: { provider: "stripe", client_secret: session.client_secret } }
    return { ok: true, payment: { provider: "mock" } }
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return { ok: false, message: "Your delivery options changed. Please choose again." }
    return { ok: false, message: errorMessage(e) }
  }
}

export async function createPaypalSessionAction(): Promise<{ ok: true; order_id: string } | Fail> {
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  try {
    const { payment_collection } = await medusa<{ payment_collection: { id: string } }>("/store/payment-collections", { method: "POST", body: { cart_id: cartId } })
    const res = await medusa<{ payment_collection: { payment_sessions?: { provider_id: string; data?: Record<string, unknown> | null }[] } }>(
      `/store/payment-collections/${payment_collection.id}/payment-sessions`,
      { method: "POST", body: { provider_id: "pp_paypal_paypal" } },
    )
    const s = (res.payment_collection.payment_sessions ?? []).find((x) => x.provider_id === "pp_paypal_paypal")
    const id = typeof s?.data?.id === "string" ? s.data.id : null
    return id ? { ok: true, order_id: id } : { ok: false, message: "PayPal is unavailable right now." }
  } catch (e) {
    return { ok: false, message: errorMessage(e) }
  }
}

/** Switch back to Stripe after trying PayPal. */
export async function resetStripeSessionAction(): Promise<{ ok: true; payment: PaymentInit } | Fail> {
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  try {
    const s = await stripeSession(cartId)
    if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return { ok: true, payment: { provider: "stripe", client_secret: s.client_secret } }
    return { ok: true, payment: { provider: "mock" } }
  } catch (e) {
    return { ok: false, message: errorMessage(e) }
  }
}

type CompleteResult = { ok: true; redirectTo: string; order: { id: string; display_id: number; total: number; currency_code: string } } | Fail

export async function completeCartAction(): Promise<CompleteResult> {
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  return complete(cartId)
}

async function complete(cartId: string): Promise<CompleteResult> {
  try {
    const res = await medusa<{ type: "order"; order: Order } | { type: "cart"; cart: Cart; error?: { message?: string } }>(`/store/carts/${cartId}/complete`, { method: "POST", body: {} })
    if (res.type !== "order") return { ok: false, message: res.error?.message ? `Payment was not completed: ${res.error.message}` : "Your payment was declined. Please try another method." }
    const jar = await cookies()
    jar.delete(COOKIE.cart)
    jar.set(EXTRA_COOKIE.lastOrder, res.order.id, secureCookie(60 * 60 * 24))
    return { ok: true, redirectTo: `/order/confirmed/${res.order.id}`, order: { id: res.order.id, display_id: res.order.display_id, total: res.order.total, currency_code: res.order.currency_code } }
  } catch (e) {
    return { ok: false, message: errorMessage(e, "We couldn't place your order. You have not been charged; please try again.") }
  }
}

const TEST_METHODS = ["pm_card_visa", "pm_card_chargeDeclined", "pm_card_riskLevelElevated"] as const

/** Local/mock mode only: stands in for Stripe.js confirming the PaymentIntent, then completes the cart. */
export async function mockPaymentAction(method: string): Promise<CompleteResult> {
  if (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return { ok: false, message: "Test payments are disabled." }
  const pm = z.enum(TEST_METHODS).safeParse(method)
  if (!pm.success) return { ok: false, message: "Choose a test payment method." }
  const cartId = await requireCart()
  if (typeof cartId !== "string") return cartId
  try {
    const cart = await retrieveCart(cartId)
    const session = cart.payment_collection?.payment_sessions?.find((s) => s.provider_id === "pp_stripe_stripe")
    let piId = typeof session?.data?.id === "string" ? session.data.id : ""
    if (!piId) piId = (await stripeSession(cartId)).id
    const res = await medusa<{ status: string }>("/store/haanta/dev/mock-payment", { method: "POST", body: { payment_intent_id: piId, payment_method: pm.data } })
    if (res.status === "requires_payment_method") {
      // Declined: give the buyer a fresh intent for the next attempt.
      await stripeSession(cartId).catch(() => null)
      return { ok: false, message: "Your card was declined. Please try another payment method." }
    }
  } catch (e) {
    return { ok: false, message: errorMessage(e, "The test payment failed.") }
  }
  return complete(cartId)
}
