import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { COOKIE, medusa, secureCookie } from "@/lib/server/medusa"
import { EXTRA_COOKIE, getCartId } from "@/lib/server/cart"
import type { Order } from "@/lib/types"

/**
 * Stripe return_url for redirect-based methods (e.g. Klarna, some wallets). Completes the cart on the
 * server; the backend only creates the order if the PaymentIntent is authorised, so this is safe to call.
 */
export async function GET(request: NextRequest) {
  const cartId = await getCartId()
  const base = request.nextUrl.clone()
  base.search = ""
  if (!cartId) {
    base.pathname = "/cart"
    return NextResponse.redirect(base, 303)
  }
  try {
    const res = await medusa<{ type: "order"; order: Order } | { type: "cart" }>(`/store/carts/${cartId}/complete`, { method: "POST", body: {} })
    if (res.type === "order") {
      const jar = await cookies()
      jar.delete(COOKIE.cart)
      jar.set(EXTRA_COOKIE.lastOrder, res.order.id, secureCookie(60 * 60 * 24))
      base.pathname = `/order/confirmed/${res.order.id}`
      return NextResponse.redirect(base, 303)
    }
  } catch {
    // fall through
  }
  base.pathname = "/checkout"
  base.searchParams.set("payment_error", "1")
  return NextResponse.redirect(base, 303)
}
