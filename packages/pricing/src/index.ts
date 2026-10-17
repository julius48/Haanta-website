/**
 * Haanta pricing rules. Server-only: never trust a retail price from a client.
 *
 * retail = round(vendorPrice × (1 + markupPercent) + markupFixed)
 * Markup resolves product → category → vendor → global. Money is integer minor units (cents/kobo).
 */
import { z } from "zod"

export const markupRuleSchema = z.object({
  /** Markup percent in basis points: 3500 = 35%. */
  percentBps: z.number().int().min(0).max(100_000),
  /** Fixed markup in USD cents. */
  fixedMinor: z.number().int().min(0).max(10_000_000),
})
export type MarkupRule = z.infer<typeof markupRuleSchema>

export const roundingModeSchema = z.enum(["whole", "whole_up", "x99", "cents"])
export type RoundingMode = z.infer<typeof roundingModeSchema>

export const pricingSettingsSchema = z.object({
  globalMarkup: markupRuleSchema,
  rounding: roundingModeSchema,
  /** Currencies the storefront sells in, besides USD. */
  presentmentCurrencies: z.array(z.string().length(3)),
})
export type PricingSettings = z.infer<typeof pricingSettingsSchema>

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  globalMarkup: { percentBps: 3500, fixedMinor: 0 },
  rounding: "whole",
  presentmentCurrencies: ["CAD"],
}

export type MarkupSource = "product" | "category" | "vendor" | "global"

export interface MarkupOverrides {
  product?: MarkupRule | null
  /** Category overrides ordered most specific first (e.g. Dresses before Women). */
  categories?: (MarkupRule | null | undefined)[]
  vendor?: MarkupRule | null
}

export function resolveMarkup(
  overrides: MarkupOverrides,
  globalMarkup: MarkupRule,
): { rule: MarkupRule; source: MarkupSource } {
  if (overrides.product) return { rule: overrides.product, source: "product" }
  const category = overrides.categories?.find((c): c is MarkupRule => !!c)
  if (category) return { rule: category, source: "category" }
  if (overrides.vendor) return { rule: overrides.vendor, source: "vendor" }
  return { rule: globalMarkup, source: "global" }
}

/** Integer division rounding half up, for non-negative numerators. */
function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d))
}

/**
 * Apply rounding to an exact amount expressed as numerator/denominator cents.
 * Returns whole cents.
 */
function roundAmount(numerator: number, denominator: number, mode: RoundingMode): number {
  switch (mode) {
    case "cents":
      return divRoundHalfUp(numerator, denominator)
    case "whole":
      return divRoundHalfUp(numerator, denominator * 100) * 100
    case "whole_up":
      return Math.ceil(numerator / (denominator * 100)) * 100
    case "x99": {
      // Charm pricing: the next price ending in .99 at or above the amount (e.g. 48.20 → 48.99).
      const cents = Math.ceil(numerator / denominator)
      return Math.floor(cents / 100) * 100 + 99
    }
  }
}

/** Retail in minor units from a vendor price in USD minor units. Never below the vendor price. */
export function computeRetailMinor(vendorMinor: number, rule: MarkupRule, mode: RoundingMode): number {
  if (!Number.isSafeInteger(vendorMinor) || vendorMinor < 0) throw new RangeError("vendor price must be a non-negative integer")
  markupRuleSchema.parse(rule)
  const denominator = 10_000
  const numerator = vendorMinor * (10_000 + rule.percentBps) + rule.fixedMinor * denominator
  if (!Number.isSafeInteger(numerator)) throw new RangeError("price too large")
  let retail = roundAmount(numerator, denominator, mode)
  if (retail < vendorMinor) retail = roundAmount(vendorMinor * denominator, denominator, mode === "whole" ? "whole_up" : mode)
  if (retail < vendorMinor) retail = vendorMinor
  return retail
}

/** Rates as units of currency per 1 USD, e.g. { NGN: 1500, CAD: 1.37 }. */
export type FxRates = Record<string, number>

/** Convert minor units between currencies via USD. Both currencies are assumed to use 2 decimals (USD, CAD, NGN). */
export function convertMinor(amountMinor: number, from: string, to: string, rates: FxRates): number {
  const rate = (c: string) => {
    const u = c.toUpperCase()
    if (u === "USD") return 1
    const r = rates[u]
    if (r === undefined || !(r > 0) || !Number.isFinite(r)) throw new RangeError(`missing FX rate for ${u}`)
    return r
  }
  if (from.toUpperCase() === to.toUpperCase()) return amountMinor
  return Math.round((amountMinor / rate(from)) * rate(to))
}

export interface VariantPriceInput {
  vendorPrice: { amountMinor: number; currency: string }
  overrides: MarkupOverrides
  settings: PricingSettings
  rates: FxRates
}

export interface VariantPrice {
  vendorPriceUsdMinor: number
  retailUsdMinor: number
  /** Retail per presentment currency, each rounded with the same rule. */
  retail: Record<string, number>
  markup: MarkupRule
  markupSource: MarkupSource
}

export function priceVariant(input: VariantPriceInput): VariantPrice {
  const { settings } = input
  const vendorPriceUsdMinor = convertMinor(input.vendorPrice.amountMinor, input.vendorPrice.currency, "USD", input.rates)
  const { rule, source } = resolveMarkup(input.overrides, settings.globalMarkup)
  const retailUsdMinor = computeRetailMinor(vendorPriceUsdMinor, rule, settings.rounding)
  const retail: Record<string, number> = { USD: retailUsdMinor }
  for (const c of settings.presentmentCurrencies) {
    const converted = convertMinor(retailUsdMinor, "USD", c, input.rates)
    retail[c.toUpperCase()] = roundAmount(converted, 1, settings.rounding)
  }
  return { vendorPriceUsdMinor, retailUsdMinor, retail, markup: rule, markupSource: source }
}

export type ProductReviewStatus = "draft" | "in_review" | "live" | "changes_requested"

/**
 * Whether a change to a product must go back to Haanta review.
 * Any price or content change to a live product needs review; the approved version stays live meanwhile.
 */
export function requiresReview(
  status: ProductReviewStatus,
  before: { retailMinor: number; vendorMinor: number; contentHash: string },
  after: { retailMinor: number; vendorMinor: number; contentHash: string },
): boolean {
  if (status === "draft") return false
  return (
    before.retailMinor !== after.retailMinor ||
    before.vendorMinor !== after.vendorMinor ||
    before.contentHash !== after.contentHash
  )
}

/** Snapshot stored on each order line so later markup changes never alter past orders or the ledger. */
export interface OrderLinePriceSnapshot {
  vendor_price_minor: number
  retail_price_minor: number
  currency: string
  markup_bps: number
  markup_fixed_minor: number
  markup_source: MarkupSource
}

export function snapshotLinePrice(p: VariantPrice, currency = "USD"): OrderLinePriceSnapshot {
  const c = currency.toUpperCase()
  const retail = p.retail[c]
  if (retail === undefined) throw new RangeError(`no retail price for ${c}`)
  return {
    vendor_price_minor: p.vendorPriceUsdMinor,
    retail_price_minor: retail,
    currency: c,
    markup_bps: p.markup.percentBps,
    markup_fixed_minor: p.markup.fixedMinor,
    markup_source: p.markupSource,
  }
}

export const toMinor = (major: number) => Math.round(major * 100)
export const toMajor = (minor: number) => minor / 100
