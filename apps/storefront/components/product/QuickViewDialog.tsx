"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Badge } from "@haanta/ui"
import { Dialog } from "@/components/ui/Dialog"
import { ProductImageClient } from "@/components/ui/ProductImageClient"
import { AddToCartForm } from "./AddToCartForm"
import { quickViewAction, type QuickViewData } from "@/app/actions/cart"
import { SHIPS_FROM_LABEL } from "@/lib/filters"

/** Quick view dialog. Loaded on demand (next/dynamic) the first time a shopper opens a quick view. */
export default function QuickViewDialog({ handle, title, onClose }: { handle: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<QuickViewData | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    setData(undefined)
    quickViewAction(handle).then(
      (d) => live && setData(d),
      () => live && setData(null),
    )
    return () => {
      live = false
    }
  }, [handle])

  return (
    <Dialog open onClose={onClose} title={title} size="lg" testId="quick-view">
      {data === undefined ? (
        <p role="status">Loading…</p>
      ) : data === null ? (
        <p role="alert">Sorry, we couldn&apos;t load this product.</p>
      ) : (
        <div className="s-qv">
          <div className="s-qv__media">
            <ProductImageClient src={data.product.images[0] ?? data.product.thumbnail} alt={data.product.title} sizes="(min-width: 768px) 360px, 90vw" />
          </div>
          <div className="s-qv__info">
            <p className="s-brand-line">
              <Link href={`/brands/${data.extras.vendor.slug}`}>{data.extras.vendor.name}</Link>
            </p>
            {data.extras.badges.length ? (
              <p className="s-badges">
                {data.extras.badges.map((b) => (
                  <Badge key={b} kind={b} />
                ))}
              </p>
            ) : null}
            <p className="s-small s-muted">{data.extras.ships_from.map((s) => SHIPS_FROM_LABEL[s]).join(" · ")}</p>
            <AddToCartForm
              compact
              handle={data.product.handle}
              productId={data.product.id}
              title={data.product.title}
              brand={data.extras.vendor.name}
              options={data.product.options ?? []}
              variants={data.product.variants ?? []}
              variantFulfilment={Object.fromEntries(data.extras.variants.map((v) => [v.variant_id, v.fulfilment_type]))}
              defaultFulfilment={data.extras.fulfilment_type}
              requiredMeasurements={data.extras.required_measurements}
              isPreorder={data.extras.is_preorder}
            />
            <p className="s-small">{data.extras.delivery_estimate}</p>
            <Link href={`/products/${data.product.handle}`} className="s-link-strong">
              View full details
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  )
}
