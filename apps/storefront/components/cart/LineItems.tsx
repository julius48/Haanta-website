import Link from "next/link"
import { ProductImage } from "@/components/ui/ProductImage"
import { CartLineControls } from "./CartLineControls"
import { formatMajor } from "@/lib/money"
import { formatMeasurements } from "@/lib/measurements"
import type { LineItem } from "@/lib/types"

export function LineItems({ items, currency, editable }: { items: LineItem[]; currency: string; editable: boolean }) {
  return (
    <ul className="s-lines" data-testid="cart-lines">
      {items.map((it) => {
        const title = it.product_title ?? it.title
        const measures = formatMeasurements(it.metadata?.measurements)
        return (
          <li key={it.id} className="s-line" data-testid="cart-line">
            <div className="s-line__img">
              <ProductImage src={it.thumbnail} alt="" sizes="96px" />
            </div>
            <div className="s-line__info">
              <p className="s-line__title">{it.product_handle ? <Link href={`/products/${it.product_handle}`}>{title}</Link> : title}</p>
              {it.variant_title && it.variant_title !== "Default" ? <p className="s-small s-muted">{it.variant_title}</p> : null}
              {measures.length ? (
                <dl className="s-measures" data-testid="line-measurements">
                  {measures.map((m) => (
                    <div key={m.label}>
                      <dt>{m.label}</dt>
                      <dd>{m.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className="s-small">
                {formatMajor(it.unit_price, currency)} each{!editable ? ` · Qty ${it.quantity}` : ""}
              </p>
              {editable ? <CartLineControls lineId={it.id} quantity={it.quantity} title={title} /> : null}
            </div>
            <p className="s-line__total">{formatMajor(it.subtotal ?? it.unit_price * it.quantity, currency)}</p>
          </li>
        )
      })}
    </ul>
  )
}
