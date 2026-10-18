"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ProductImageClient } from "@/components/ui/ProductImageClient"
import { parseRecent, pushRecent, RECENT_KEY, type RecentItem } from "@/lib/recently-viewed"
import { track } from "@/lib/analytics"

/** Records this product in localStorage, fires view_item, and lists other recently viewed items. */
export function RecentlyViewed({ current, analytics }: { current: RecentItem; analytics: { id: string; price: number | null; currency: string } }) {
  const [items, setItems] = useState<RecentItem[]>([])
  const seen = useRef<string | null>(null)

  useEffect(() => {
    // Props get new identities on every server refresh; record each product once.
    if (seen.current === current.handle) return
    seen.current = current.handle
    let list: RecentItem[] = []
    try {
      list = parseRecent(localStorage.getItem(RECENT_KEY))
      localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(list, current)))
    } catch {
      // storage unavailable
    }
    setItems(list.filter((x) => x.handle !== current.handle).slice(0, 6))
    track("view_item", {
      currency: analytics.currency.toUpperCase(),
      value: analytics.price ?? undefined,
      items: [{ item_id: analytics.id, item_name: current.title, item_brand: current.brand, price: analytics.price ?? undefined }],
    })
  }, [current, analytics])

  if (!items.length) return null
  return (
    <section className="h-container s-section" aria-labelledby="recent-title">
      <h2 id="recent-title">Recently viewed</h2>
      <ul className="s-rail">
        {items.map((it) => (
          <li key={it.handle} className="s-rail__item">
            <Link href={`/products/${it.handle}`} className="s-mini-card">
              <span className="s-mini-card__img">
                <ProductImageClient src={it.thumbnail} alt="" sizes="160px" />
              </span>
              <span className="s-card__brand">{it.brand}</span>
              <span className="s-mini-card__title">{it.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
