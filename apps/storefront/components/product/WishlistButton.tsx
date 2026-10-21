"use client"

import { useState, useTransition } from "react"
import { toggleWishlistAction } from "@/app/actions/cart"

export function WishlistButton({ productId, title, initialSaved, variant = "icon" }: { productId: string; title: string; initialSaved: boolean; variant?: "icon" | "text" }) {
  const [saved, setSaved] = useState(initialSaved)
  const [pending, start] = useTransition()
  const toggle = () =>
    start(async () => {
      setSaved((s) => !s)
      const res = await toggleWishlistAction(productId)
      if (res.ok) setSaved(res.saved)
    })
  return (
    <button
      type="button"
      className={variant === "icon" ? "s-heart" : "s-heart-text"}
      aria-pressed={saved}
      aria-label={variant === "icon" ? `Save ${title} to wishlist` : undefined}
      onClick={toggle}
      disabled={pending}
      data-testid="wishlist-toggle"
    >
      <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24">
        <path
          d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.4 3.6 4.1 6.8C19.5 16.4 12 21 12 21z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
      {variant === "text" ? <span>{saved ? "Saved to wishlist" : "Save to wishlist"}</span> : null}
    </button>
  )
}
