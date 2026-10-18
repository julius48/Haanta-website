import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { ApiError, COOKIE, medusa } from "./medusa"
import { EXTRA_COOKIE } from "./cart"
import type { Customer, Order } from "@/lib/types"

export async function isSignedIn(): Promise<boolean> {
  return !!(await cookies()).get(COOKIE.session)?.value
}

/** The signed-in buyer, or null (expired tokens behave like signed out). */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  if (!(await isSignedIn())) return null
  try {
    const { customer } = await medusa<{ customer: Customer }>("/store/customers/me?fields=*addresses", { auth: true })
    return customer
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
    return null
  }
})

const ORDER_FIELDS = "id,display_id,email,status,created_at,currency_code,total,subtotal,item_total,shipping_total,tax_total,discount_total,fulfillment_status,payment_status,*items,+items.metadata,*shipping_address"

export async function listOrders(): Promise<Order[]> {
  try {
    const { orders } = await medusa<{ orders: Order[] }>(`/store/orders?limit=50&order=-created_at&fields=${encodeURIComponent("id,display_id,status,created_at,currency_code,total,fulfillment_status,payment_status")}`, { auth: true })
    return orders
  } catch {
    return []
  }
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!/^order_[A-Za-z0-9]+$/.test(id)) return null
  try {
    const { order } = await medusa<{ order: Order }>(`/store/orders/${id}?fields=${encodeURIComponent(ORDER_FIELDS)}`, { auth: true })
    return order
  } catch {
    return null
  }
}

/** An order may be shown if it belongs to the signed-in buyer or was just placed in this browser. */
export async function canViewOrder(order: Order, customer: Customer | null): Promise<boolean> {
  const last = (await cookies()).get(EXTRA_COOKIE.lastOrder)?.value
  if (last && last === order.id) return true
  return !!customer && !!order.email && customer.email.toLowerCase() === order.email.toLowerCase()
}

export async function getWishlistIds(): Promise<string[]> {
  const raw = (await cookies()).get(EXTRA_COOKIE.wishlist)?.value ?? ""
  return raw
    .split(",")
    .filter((id) => /^prod_[A-Za-z0-9]+$/.test(id))
    .slice(0, 50)
}
