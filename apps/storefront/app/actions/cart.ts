"use server"

import { cookies } from "next/headers"
import { refresh } from "next/cache"
import { z } from "zod"
import { ApiError, COOKIE, medusa, secureCookie } from "@/lib/server/medusa"
import { errorMessage } from "@/lib/server/errors"
import { CART_MAX_AGE, getCartId, isCartId, retrieveCart } from "@/lib/server/cart"
import { getRegion, listRegions, regionForCountry } from "@/lib/server/region"
import { getProduct, getProductExtras, isHandle, productPrice, slimForClient } from "@/lib/server/catalog"
import { MEASUREMENT_FIELDS, validateMeasurements, validateOptionalMeasurements } from "@/lib/measurements"
import { isCountryCode } from "@/lib/site"
import type { ActionState, Cart, ProductExtras, StoreProduct } from "@/lib/types"

/** Return the open cart id, creating a cart in the shopper's region if needed. */
async function ensureCart(): Promise<string> {
  const existing = await getCartId()
  if (existing) {
    try {
      const cart = await retrieveCart(existing)
      if (!cart.completed_at) return existing
    } catch {
      // fall through and create a new cart
    }
  }
  const { region } = await getRegion()
  const { cart } = await medusa<{ cart: Cart }>("/store/carts", { method: "POST", body: region ? { region_id: region.id } : {} })
  ;(await cookies()).set(COOKIE.cart, cart.id, secureCookie(CART_MAX_AGE))
  return cart.id
}

const measurementInput = z.record(z.string().max(20), z.union([z.string().max(300), z.number()])).optional()

const AddToCartSchema = z
  .object({
    handle: z.string().refine(isHandle),
    variant_id: z.string().regex(/^variant_[A-Za-z0-9]+$/),
    quantity: z.coerce.number().int().min(1).max(10),
    measurements: measurementInput,
  })
  .strict()

export type AddToCartInput = z.input<typeof AddToCartSchema>
export type AddToCartResult = { ok: true; count: number } | { ok: false; message: string; fieldErrors?: Record<string, string> }

export async function addToCartAction(input: AddToCartInput): Promise<AddToCartResult> {
  const parsed = AddToCartSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: "Please choose your options and try again." }
  const { handle, variant_id, quantity } = parsed.data
  const extras = await getProductExtras(handle)
  if (!extras || !extras.variants.some((v) => v.variant_id === variant_id)) return { ok: false, message: "This item is no longer available." }

  // Server-side measurement validation for made-to-order variants (the backend re-checks).
  const variantInfo = extras.variants.find((v) => v.variant_id === variant_id)
  const madeToOrder = (variantInfo?.fulfilment_type ?? extras.fulfilment_type) === "made_to_order"
  // Optional custom sizing on any product: whatever the shopper filled in must be in range.
  const sizing = parsed.data.measurements ?? {}
  const optional = validateOptionalMeasurements(sizing)
  if (!optional.ok) return { ok: false, message: "Please check your measurements.", fieldErrors: optional.errors }
  let collected = optional.value as Record<string, number | string>
  if (madeToOrder && extras.required_measurements.length) {
    const result = validateMeasurements(extras.required_measurements, sizing)
    if (!result.ok) return { ok: false, message: "Please check your measurements.", fieldErrors: result.errors }
    collected = { ...collected, ...(result.value as Record<string, number | string>) }
  }
  const measurements = Object.keys(collected).length ? collected : undefined

  try {
    const cartId = await ensureCart()
    const { cart } = await medusa<{ cart: Cart }>(`/store/carts/${cartId}/line-items`, {
      method: "POST",
      body: { variant_id, quantity, ...(measurements ? { metadata: { measurements } } : {}) },
    })
    refresh()
    return { ok: true, count: (cart.items ?? []).reduce((n, i) => n + Number(i.quantity), 0) }
  } catch (e) {
    if (e instanceof ApiError && e.body?.code === "measurements_required") {
      const missing = (e.body as { missing?: string[] }).missing ?? []
      const fieldErrors = Object.fromEntries(
        missing.map((k) => [k, `Enter your ${(MEASUREMENT_FIELDS[k as keyof typeof MEASUREMENT_FIELDS]?.label ?? k).toLowerCase()} in inches`]),
      )
      return { ok: false, message: errorMessage(e), fieldErrors }
    }
    return { ok: false, message: errorMessage(e, "We couldn't add this to your bag. Please try again.") }
  }
}

const LineSchema = z.object({ line_id: z.string().regex(/^[A-Za-z0-9_]+$/), quantity: z.coerce.number().int().min(0).max(10) }).strict()

export async function updateLineItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LineSchema.safeParse({ line_id: formData.get("line_id"), quantity: formData.get("quantity") })
  if (!parsed.success) return { status: "error", message: "Choose a quantity between 0 and 10." }
  const cartId = await getCartId()
  if (!cartId) return { status: "error", message: "Your bag has expired." }
  try {
    if (parsed.data.quantity === 0) await medusa(`/store/carts/${cartId}/line-items/${parsed.data.line_id}`, { method: "DELETE" })
    else await medusa(`/store/carts/${cartId}/line-items/${parsed.data.line_id}`, { method: "POST", body: { quantity: parsed.data.quantity } })
    refresh()
    return { status: "ok", message: parsed.data.quantity === 0 ? "Item removed." : "Quantity updated." }
  } catch (e) {
    return { status: "error", message: errorMessage(e) }
  }
}

export async function removeLineItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = z.string().regex(/^[A-Za-z0-9_]+$/).safeParse(formData.get("line_id"))
  const cartId = await getCartId()
  if (!id.success || !cartId) return { status: "error", message: "Couldn't remove that item." }
  try {
    await medusa(`/store/carts/${cartId}/line-items/${id.data}`, { method: "DELETE" })
    refresh()
    return { status: "ok", message: "Item removed." }
  } catch (e) {
    return { status: "error", message: errorMessage(e) }
  }
}

const PromoSchema = z.object({ code: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/, "Codes use letters, numbers, - and _") })

/** Discount and gift card codes (gift cards are issued as promotion codes). */
export async function applyPromoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PromoSchema.safeParse({ code: formData.get("code") })
  if (!parsed.success) return { status: "error", message: "Enter a valid code.", fieldErrors: { code: parsed.error.issues[0]?.message ?? "Enter a valid code" } }
  const cartId = await getCartId()
  if (!cartId) return { status: "error", message: "Add something to your bag first." }
  const code = parsed.data.code.toUpperCase()
  try {
    const { cart } = await medusa<{ cart: Cart }>(`/store/carts/${cartId}/promotions`, { method: "POST", body: { promo_codes: [code] } })
    const applied = (cart.promotions ?? []).some((p) => p.code?.toUpperCase() === code)
    refresh()
    if (!applied) return { status: "error", message: "That code isn't valid for your bag.", fieldErrors: { code: "That code isn't valid for your bag" } }
    return { status: "ok", message: `Code ${code} applied.` }
  } catch (e) {
    return { status: "error", message: errorMessage(e, "That code isn't valid."), fieldErrors: { code: "That code isn't valid" } }
  }
}

export async function removePromoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PromoSchema.safeParse({ code: formData.get("code") })
  const cartId = await getCartId()
  if (!parsed.success || !cartId) return { status: "error", message: "Couldn't remove that code." }
  try {
    await medusa(`/store/carts/${cartId}/promotions`, { method: "DELETE", body: { promo_codes: [parsed.data.code] } })
    refresh()
    return { status: "ok", message: "Code removed." }
  } catch (e) {
    return { status: "error", message: errorMessage(e) }
  }
}

/** Country / currency selector. Moves an open cart to the new region so prices match. */
export async function setCountryAction(formData: FormData): Promise<void> {
  const country = formData.get("country")
  if (!isCountryCode(country)) return
  const jar = await cookies()
  jar.set(COOKIE.country, country, secureCookie(60 * 60 * 24 * 365))
  const cartId = jar.get(COOKIE.cart)?.value
  if (cartId && isCartId(cartId)) {
    const region = regionForCountry(await listRegions(), country)
    if (region) {
      try {
        await medusa(`/store/carts/${cartId}`, { method: "POST", body: { region_id: region.id } })
      } catch {
        // a completed/expired cart is replaced on the next add to bag
      }
    }
  }
  refresh()
}

const WISHLIST_COOKIE = "haanta_wishlist"

export async function toggleWishlistAction(productId: string): Promise<{ ok: boolean; saved: boolean }> {
  if (!/^prod_[A-Za-z0-9]+$/.test(productId)) return { ok: false, saved: false }
  const jar = await cookies()
  const ids = (jar.get(WISHLIST_COOKIE)?.value ?? "").split(",").filter((x) => /^prod_[A-Za-z0-9]+$/.test(x))
  const saved = !ids.includes(productId)
  const next = saved ? [productId, ...ids].slice(0, 50) : ids.filter((x) => x !== productId)
  jar.set(WISHLIST_COOKIE, next.join(","), secureCookie(60 * 60 * 24 * 365))
  return { ok: true, saved }
}

export interface QuickViewData {
  product: Pick<StoreProduct, "id" | "title" | "handle" | "thumbnail" | "options" | "variants"> & { images: string[] }
  extras: Pick<ProductExtras, "vendor" | "fulfilment_type" | "is_preorder" | "required_measurements" | "ships_from" | "delivery_estimate" | "badges" | "variants">
  price: { amount: number | null; original: number | null; currency: string }
}

export async function quickViewAction(handle: string): Promise<QuickViewData | null> {
  if (typeof handle !== "string" || !isHandle(handle)) return null
  const { region } = await getRegion()
  const [product, extras] = await Promise.all([getProduct(handle, region?.id).catch(() => null), getProductExtras(handle).catch(() => null)])
  if (!product || !extras) return null
  return {
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      thumbnail: product.thumbnail,
      ...slimForClient(product),
      images: (product.images ?? []).map((i) => i.url).slice(0, 4),
    },
    extras: {
      vendor: extras.vendor,
      fulfilment_type: extras.fulfilment_type,
      is_preorder: extras.is_preorder,
      required_measurements: extras.required_measurements,
      ships_from: extras.ships_from,
      delivery_estimate: extras.delivery_estimate,
      badges: extras.badges,
      variants: extras.variants,
    },
    price: productPrice(product),
  }
}
