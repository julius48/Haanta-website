import { formatMajor } from "@/lib/money"
import type { Cart } from "@/lib/types"

/** Totals exactly as the backend computed them (never recalculated in the browser). */
export function CartSummary({ cart, dutiesMessage, showShipping }: { cart: Cart; dutiesMessage: string; showShipping: boolean }) {
  const cur = cart.currency_code
  const discount = Number(cart.discount_total ?? 0)
  const shipping = Number(cart.shipping_total ?? 0)
  return (
    <dl className="s-summary" data-testid="cart-summary">
      <div>
        <dt>Subtotal</dt>
        <dd data-testid="summary-subtotal">{formatMajor(cart.item_subtotal ?? cart.subtotal ?? 0, cur)}</dd>
      </div>
      {discount > 0 ? (
        <div>
          <dt>Discount</dt>
          <dd>−{formatMajor(discount, cur)}</dd>
        </div>
      ) : null}
      <div>
        <dt>Shipping</dt>
        <dd data-testid="summary-shipping">{showShipping && cart.shipping_methods?.length ? (shipping === 0 ? "Free" : formatMajor(shipping, cur)) : "Calculated at checkout"}</dd>
      </div>
      <div className="s-summary__total">
        <dt>Total ({cur.toUpperCase()})</dt>
        <dd data-testid="summary-total">{formatMajor(cart.total ?? 0, cur)}</dd>
      </div>
      <p className="s-small s-summary__duties" data-testid="duties-message">
        {dutiesMessage}
      </p>
    </dl>
  )
}
