import { formatMoney } from "@haanta/ui"
import type { SearchDocument } from "./types"

/** Medusa store amounts are major units; @haanta/ui money helpers take minor units. */
export function toMinor(major: number): number {
  return Math.round(major * 100)
}

export function formatMajor(amount: number | null | undefined, currency: string): string {
  return formatMoney(toMinor(amount ?? 0), currency.toUpperCase())
}

/** Price of a search document in the shopper's currency (CAD has no compare-at price). */
export function docPrice(
  doc: Pick<SearchDocument, "price_usd" | "price_cad" | "compare_at_usd">,
  currency: string,
): { amountMinor: number; compareAtMinor: number | null; currency: "USD" | "CAD" } {
  if (currency.toLowerCase() === "cad") return { amountMinor: toMinor(doc.price_cad), compareAtMinor: null, currency: "CAD" }
  const compare = doc.compare_at_usd != null && doc.compare_at_usd > doc.price_usd ? toMinor(doc.compare_at_usd) : null
  return { amountMinor: toMinor(doc.price_usd), compareAtMinor: compare, currency: "USD" }
}

/** Progress towards free standard shipping (threshold is in USD; only shown for USD carts). */
export function freeShippingProgress(subtotalMajor: number, thresholdUsd: number): { remaining: number; percent: number; reached: boolean } {
  if (thresholdUsd <= 0) return { remaining: 0, percent: 100, reached: true }
  const remaining = Math.max(0, Math.round((thresholdUsd - subtotalMajor) * 100) / 100)
  const percent = Math.min(100, Math.max(0, Math.round((subtotalMajor / thresholdUsd) * 100)))
  return { remaining, percent, reached: remaining === 0 }
}
