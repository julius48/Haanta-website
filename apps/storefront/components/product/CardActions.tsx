"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { toggleWishlistAction } from "@/app/actions/cart"

const QuickViewDialog = dynamic(() => import("./QuickViewDialog"), { ssr: false })

/**
 * One delegated controller for every product card on the page (instead of two React islands per
 * card). Cards render plain buttons with data attributes:
 *   [data-wishlist="<product id>"]  toggles the wishlist (optimistic, reverts on failure)
 *   [data-quickview="<handle>"]     opens the quick view (dialog code loads on first use)
 */
export function CardActions() {
  const [quick, setQuick] = useState<{ handle: string; title: string; opener: HTMLElement } | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const wish = target?.closest<HTMLButtonElement>("button[data-wishlist]")
      if (wish) {
        e.preventDefault()
        if (wish.dataset.pending === "1") return
        const was = wish.getAttribute("aria-pressed") === "true"
        wish.setAttribute("aria-pressed", String(!was))
        wish.dataset.pending = "1"
        toggleWishlistAction(wish.dataset.wishlist!)
          .then((res) => wish.setAttribute("aria-pressed", String(res.ok ? res.saved : was)))
          .catch(() => wish.setAttribute("aria-pressed", String(was)))
          .finally(() => delete wish.dataset.pending)
        return
      }
      const qv = target?.closest<HTMLButtonElement>("button[data-quickview]")
      if (qv) {
        e.preventDefault()
        setQuick({ handle: qv.dataset.quickview!, title: qv.dataset.title ?? "Quick view", opener: qv })
      }
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])

  if (!quick) return null
  return (
    <QuickViewDialog
      handle={quick.handle}
      title={quick.title}
      onClose={() => {
        quick.opener.focus()
        setQuick(null)
      }}
    />
  )
}
