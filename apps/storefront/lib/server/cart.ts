import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { ApiError, COOKIE, medusa } from "./medusa"
import type { Cart } from "@/lib/types"

/** Extra cookies used by the storefront (all HttpOnly via secureCookie()). */
export const EXTRA_COOKIE = {
  wishlist: "haanta_wishlist",
  lastOrder: "haanta_last_order",
} as const

export const CART_MAX_AGE = 60 * 60 * 24 * 30
export const SESSION_MAX_AGE = 60 * 60 * 12

const CART_FIELDS =
  "*items,*items.variant,+items.metadata,*promotions,*shipping_methods,*shipping_address,*payment_collection,*payment_collection.payment_sessions,+subtotal,+item_subtotal,+total,+tax_total,+discount_total,+shipping_total"

export const isCartId = (id: string) => /^cart_[A-Za-z0-9]+$/.test(id)

export async function getCartId(): Promise<string | null> {
  const id = (await cookies()).get(COOKIE.cart)?.value
  return id && isCartId(id) ? id : null
}

/** The shopper's open cart (null if none, completed or gone). */
export const getCart = cache(async (): Promise<Cart | null> => {
  const id = await getCartId()
  if (!id) return null
  try {
    const { cart } = await medusa<{ cart: Cart }>(`/store/carts/${id}?fields=${encodeURIComponent(CART_FIELDS)}`)
    return cart.completed_at ? null : cart
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null
    return null
  }
})

/** Item count for the header badge (cheap field set). */
export const getCartCount = cache(async (): Promise<number> => {
  const id = await getCartId()
  if (!id) return 0
  try {
    const { cart } = await medusa<{ cart: { items?: { quantity: number }[]; completed_at?: string | null } }>(`/store/carts/${id}?fields=id,completed_at,items.quantity`)
    if (cart.completed_at) return 0
    return (cart.items ?? []).reduce((n, i) => n + Number(i.quantity), 0)
  } catch {
    return 0
  }
})

export async function retrieveCart(id: string): Promise<Cart> {
  const { cart } = await medusa<{ cart: Cart }>(`/store/carts/${id}?fields=${encodeURIComponent(CART_FIELDS)}`)
  return cart
}
