import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  DEFAULT_PRICING_SETTINGS,
  computeRetailMinor,
  convertMinor,
  priceVariant,
  requiresReview,
  resolveMarkup,
  snapshotLinePrice,
  type MarkupRule,
  type RoundingMode,
} from "../src"

const rule = (percentBps: number, fixedMinor = 0): MarkupRule => ({ percentBps, fixedMinor })
const rates = { NGN: 1500, CAD: 1.37 }

describe("computeRetailMinor", () => {
  it("applies percent and fixed markup and rounds to whole dollars by default", () => {
    // $50 × 1.35 = $67.50 → $68
    expect(computeRetailMinor(5000, rule(3500), "whole")).toBe(6800)
    // $40 × 1.25 + $5 = $55
    expect(computeRetailMinor(4000, rule(2500, 500), "whole")).toBe(5500)
    // $33.30 × 1.35 = $44.955 → $45
    expect(computeRetailMinor(3330, rule(3500), "whole")).toBe(4500)
  })

  it("supports other rounding modes", () => {
    expect(computeRetailMinor(3330, rule(3500), "cents")).toBe(4496)
    expect(computeRetailMinor(3330, rule(3500), "whole_up")).toBe(4500)
    expect(computeRetailMinor(3300, rule(3500), "whole_up")).toBe(4500) // 44.55 → 45
    expect(computeRetailMinor(3300, rule(3500), "x99")).toBe(4499) // 44.55 → 44.99
    expect(computeRetailMinor(3704, rule(3500), "x99")).toBe(5099) // 50.004 → 50.99
  })

  it("never rounds below the vendor price", () => {
    expect(computeRetailMinor(1040, rule(0), "whole")).toBe(1100)
  })

  it("rejects invalid input", () => {
    expect(() => computeRetailMinor(-1, rule(0), "whole")).toThrow()
    expect(() => computeRetailMinor(1.5, rule(0), "whole")).toThrow()
    expect(() => computeRetailMinor(100, rule(-5), "whole")).toThrow()
  })
})

describe("resolveMarkup", () => {
  const g = rule(3500)
  it("resolves product → category → vendor → global", () => {
    expect(resolveMarkup({ product: rule(1), categories: [rule(2)], vendor: rule(3) }, g)).toEqual({ rule: rule(1), source: "product" })
    expect(resolveMarkup({ categories: [null, rule(2)], vendor: rule(3) }, g)).toEqual({ rule: rule(2), source: "category" })
    expect(resolveMarkup({ vendor: rule(3) }, g)).toEqual({ rule: rule(3), source: "vendor" })
    expect(resolveMarkup({}, g)).toEqual({ rule: g, source: "global" })
  })
})

describe("priceVariant", () => {
  it("prices in USD and CAD from a USD vendor price", () => {
    const p = priceVariant({ vendorPrice: { amountMinor: 5000, currency: "USD" }, overrides: {}, settings: DEFAULT_PRICING_SETTINGS, rates })
    expect(p.retailUsdMinor).toBe(6800)
    expect(p.retail).toEqual({ USD: 6800, CAD: 9300 }) // 68 × 1.37 = 93.16 → 93
    expect(p.markupSource).toBe("global")
  })

  it("converts an NGN vendor price to USD first", () => {
    const p = priceVariant({ vendorPrice: { amountMinor: 7_500_000, currency: "NGN" }, overrides: {}, settings: DEFAULT_PRICING_SETTINGS, rates })
    expect(p.vendorPriceUsdMinor).toBe(5000)
    expect(p.retailUsdMinor).toBe(6800)
  })

  it("snapshots the line price for orders", () => {
    const p = priceVariant({ vendorPrice: { amountMinor: 5000, currency: "USD" }, overrides: { vendor: rule(2000, 100) }, settings: DEFAULT_PRICING_SETTINGS, rates })
    expect(snapshotLinePrice(p, "cad")).toEqual({
      vendor_price_minor: 5000,
      retail_price_minor: 8400, // 50 × 1.2 + 1 = 61 → × 1.37 = 83.57 → 84
      currency: "CAD",
      markup_bps: 2000,
      markup_fixed_minor: 100,
      markup_source: "vendor",
    })
    expect(() => snapshotLinePrice(p, "EUR")).toThrow()
  })

  it("throws on missing FX rates", () => {
    expect(() => convertMinor(100, "USD", "EUR", rates)).toThrow()
  })
})

describe("properties", () => {
  const modes: RoundingMode[] = ["whole", "whole_up", "x99", "cents"]
  const vendor = fc.integer({ min: 0, max: 5_000_000 })
  const markup = fc.record({ percentBps: fc.integer({ min: 0, max: 30_000 }), fixedMinor: fc.integer({ min: 0, max: 10_000 }) })
  const mode = fc.constantFrom(...modes)

  it("retail is never below the vendor price", () => {
    fc.assert(fc.property(vendor, markup, mode, (v, m, r) => computeRetailMinor(v, m, r) >= v), { numRuns: 2000 })
  })

  it("retail is monotonic in vendor price and in markup", () => {
    fc.assert(
      fc.property(vendor, vendor, markup, mode, (a, b, m, r) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        return computeRetailMinor(lo, m, r) <= computeRetailMinor(hi, m, r)
      }),
    )
    fc.assert(
      fc.property(vendor, markup, fc.integer({ min: 0, max: 5000 }), mode, (v, m, extra, r) =>
        computeRetailMinor(v, m, r) <= computeRetailMinor(v, { ...m, percentBps: m.percentBps + extra }, r),
      ),
    )
  })

  it("whole rounding stays within half a dollar of the exact price (unless clamped to vendor)", () => {
    fc.assert(
      fc.property(vendor, markup, (v, m) => {
        const exact = (v * (10_000 + m.percentBps)) / 10_000 + m.fixedMinor
        const retail = computeRetailMinor(v, m, "whole")
        return retail % 100 === 0 && (Math.abs(retail - exact) <= 50 || retail >= v)
      }),
    )
  })

  it("a markup change recalculates the price and sends a live product back to review", () => {
    fc.assert(
      fc.property(vendor.filter((v) => v >= 100), markup, markup, (v, m1, m2) => {
        const before = computeRetailMinor(v, m1, "cents")
        const after = computeRetailMinor(v, m2, "cents")
        const review = requiresReview("live", { retailMinor: before, vendorMinor: v, contentHash: "h" }, { retailMinor: after, vendorMinor: v, contentHash: "h" })
        return review === (before !== after)
      }),
    )
    expect(requiresReview("live", { retailMinor: 1, vendorMinor: 1, contentHash: "a" }, { retailMinor: 1, vendorMinor: 1, contentHash: "b" })).toBe(true)
    expect(requiresReview("draft", { retailMinor: 1, vendorMinor: 1, contentHash: "a" }, { retailMinor: 2, vendorMinor: 1, contentHash: "b" })).toBe(false)
  })

  it("currency conversion is consistent: round trips stay within one minor unit per conversion", () => {
    const rate = fc.double({ min: 0.5, max: 2000, noNaN: true })
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), rate, (amount, r) => {
        const fx = { XXX: r }
        const there = convertMinor(amount, "USD", "XXX", fx)
        const back = convertMinor(there, "XXX", "USD", fx)
        return Math.abs(back - amount) <= Math.ceil(1 / r) + 1
      }),
    )
  })

  it("an NGN vendor price and its USD equivalent price identically", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), markup, (usdMinor, m) => {
        const settings = { ...DEFAULT_PRICING_SETTINGS, globalMarkup: m }
        const a = priceVariant({ vendorPrice: { amountMinor: usdMinor, currency: "USD" }, overrides: {}, settings, rates })
        const b = priceVariant({ vendorPrice: { amountMinor: usdMinor * 1500, currency: "NGN" }, overrides: {}, settings, rates })
        return a.retailUsdMinor === b.retailUsdMinor && a.retail.CAD === b.retail.CAD
      }),
    )
  })

  it("presentment prices are monotonic with USD retail", () => {
    fc.assert(
      fc.property(vendor, vendor, (a, b) => {
        const p = (v: number) => priceVariant({ vendorPrice: { amountMinor: v, currency: "USD" }, overrides: {}, settings: DEFAULT_PRICING_SETTINGS, rates })
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        return p(lo).retail.CAD! <= p(hi).retail.CAD!
      }),
    )
  })
})
