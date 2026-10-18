import { describe, expect, it } from "vitest"
import { docPrice, formatMajor, freeShippingProgress, toMinor } from "@/lib/money"
import { buildFilterHref, hasActiveFilters, parseFilters, toPageParams, toSearchQuery } from "@/lib/filters"
import { formatMeasurements, validateMeasurements, validateOptionalMeasurements } from "@/lib/measurements"
import { parseStoredTimestamp, popupDelayMs, shouldShowPopup } from "@/lib/popup"
import { breadcrumbJsonLd, organizationJsonLd, productJsonLd, serializeJsonLd } from "@/lib/jsonld"
import { parseConsent, readConsentCookie, serializeConsent } from "@/lib/consent"
import { parseRecent, pushRecent, type RecentItem } from "@/lib/recently-viewed"
import { scrubParams } from "@/lib/analytics"
import { categoryLabel, findCategory } from "@/lib/categories"

describe("money", () => {
  it("converts major units to minor without float drift", () => {
    expect(toMinor(68)).toBe(6800)
    expect(toMinor(19.99)).toBe(1999)
    expect(toMinor(0.1 + 0.2)).toBe(30)
  })
  it("formats USD and CAD", () => {
    expect(formatMajor(68, "usd")).toBe("$68")
    expect(formatMajor(19.5, "usd")).toBe("$19.50")
    expect(formatMajor(74, "cad")).toBe("CA$74")
  })
  it("prices search documents per currency; compare-at only when higher and USD", () => {
    const doc = { price_usd: 54, price_cad: 74, compare_at_usd: 70 }
    expect(docPrice(doc, "usd")).toEqual({ amountMinor: 5400, compareAtMinor: 7000, currency: "USD" })
    expect(docPrice(doc, "cad")).toEqual({ amountMinor: 7400, compareAtMinor: null, currency: "CAD" })
    expect(docPrice({ ...doc, compare_at_usd: 50 }, "usd").compareAtMinor).toBeNull()
  })
  it("computes free-shipping progress", () => {
    expect(freeShippingProgress(100, 150)).toEqual({ remaining: 50, percent: 67, reached: false })
    expect(freeShippingProgress(150, 150)).toEqual({ remaining: 0, percent: 100, reached: true })
    expect(freeShippingProgress(10, 0).reached).toBe(true)
  })
})

describe("filters", () => {
  it("parses and sanitises search params", () => {
    const f = parseFilters({ brand: ["a", "a", "b"], ships_from: "houston", fulfilment: "bogus", sort: "price_asc", page: "3", price_min: "-5", price_max: "200", on_sale: "1", category: "Women/Dresses" })
    expect(f.brand).toEqual(["a", "b"])
    expect(f.ships_from).toBe("houston")
    expect(f.fulfilment).toBeUndefined()
    expect(f.sort).toBe("price_asc")
    expect(f.page).toBe(3)
    expect(f.price_min).toBeUndefined()
    expect(f.price_max).toBe(200)
    expect(f.on_sale).toBe(true)
    expect(f.category).toBe("women/dresses")
    expect(parseFilters({ category: "../etc" }).category).toBeUndefined()
  })
  it("builds backend queries with repeated params and never on_sale=false", () => {
    const q = new URLSearchParams(toSearchQuery(parseFilters({ size: ["S", "M"] }), { currency: "CAD", shop: "vacay-bae" }))
    expect(q.getAll("size")).toEqual(["S", "M"])
    expect(q.get("currency")).toBe("cad")
    expect(q.get("shop")).toBe("vacay-bae")
    expect(q.has("on_sale")).toBe(false)
    expect(q.get("limit")).toBe("24")
  })
  it("builds filter links and resets the page", () => {
    const f = parseFilters({ brand: "x", page: "4", sort: "newest" })
    const ctx = { basePath: "/search", categoryMode: "param" as const }
    expect(buildFilterHref(ctx, f, { toggle: "brand", value: "y" })).toBe("/search?brand=x&brand=y&sort=newest")
    expect(buildFilterHref(ctx, f, { toggle: "brand", value: "x" })).toBe("/search?sort=newest")
    expect(buildFilterHref(ctx, f, { set: { page: 5 } })).toBe("/search?brand=x&sort=newest&page=5")
    expect(buildFilterHref(ctx, f, { clear: true })).toBe("/search?sort=newest")
  })
  it("puts the category in the path for /shop", () => {
    const f = parseFilters({ ships_from: "lagos" })
    expect(buildFilterHref({ basePath: "/shop", categoryMode: "path" }, { ...f, category: "women" }, { set: { category: "women/dresses" } })).toBe("/shop/women/dresses?ships_from=lagos")
    expect(toPageParams({ ...f, category: "men" }, false).has("category")).toBe(false)
  })
  it("detects active filters", () => {
    expect(hasActiveFilters(parseFilters({ q: "dress", sort: "newest" }))).toBe(false)
    expect(hasActiveFilters(parseFilters({ color: "red" }))).toBe(true)
  })
})

describe("measurements", () => {
  const required = [
    { key: "bust", label: "Bust", min: 20, max: 80, unit: "in" },
    { key: "waist", label: "Waist", min: 18, max: 70, unit: "in" },
  ]
  it("accepts valid values and rounds to 0.1", () => {
    expect(validateMeasurements(required, { bust: "36.25", waist: 30, notes: " long sleeves " })).toEqual({ ok: true, value: { bust: 36.3, waist: 30, notes: "long sleeves" } })
  })
  it("rejects missing, non-numeric and out-of-range values", () => {
    const r = validateMeasurements(required, { bust: "", waist: "abc" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.bust).toMatch(/bust/i)
      expect(r.errors.waist).toMatch(/number/)
    }
    const r2 = validateMeasurements(required, { bust: 90, waist: 30 })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errors.bust).toContain("between 20 and 80")
  })
  it("ignores unknown keys and caps notes", () => {
    expect(validateMeasurements([{ key: "evil", label: "x", min: 0, max: 1, unit: "in" }], {}).ok).toBe(true)
    expect(validateMeasurements([], { notes: "x".repeat(301) }).ok).toBe(false)
  })
  it("formats measurements for display", () => {
    expect(formatMeasurements({ bust: 36, notes: "hi" })).toEqual([
      { label: "Bust", value: "36 in" },
      { label: "Notes", value: "hi" },
    ])
  })
})

describe("newsletter popup frequency", () => {
  const cfg = { enabled: true, delaySeconds: 20, frequencyDays: 14, showOnMobile: false }
  const now = Date.UTC(2026, 9, 17)
  it("shows when never shown, respects frequency cap, mobile and subscription", () => {
    expect(shouldShowPopup(cfg, { now, lastShownAt: null, isMobile: false })).toBe(true)
    expect(shouldShowPopup(cfg, { now, lastShownAt: now - 13 * 86_400_000, isMobile: false })).toBe(false)
    expect(shouldShowPopup(cfg, { now, lastShownAt: now - 14 * 86_400_000, isMobile: false })).toBe(true)
    expect(shouldShowPopup(cfg, { now, lastShownAt: null, isMobile: true })).toBe(false)
    expect(shouldShowPopup({ ...cfg, showOnMobile: true }, { now, lastShownAt: null, isMobile: true })).toBe(true)
    expect(shouldShowPopup(cfg, { now, lastShownAt: null, isMobile: false, subscribed: true })).toBe(false)
    expect(shouldShowPopup({ ...cfg, enabled: false }, { now, lastShownAt: null, isMobile: false })).toBe(false)
    expect(shouldShowPopup(null, { now, lastShownAt: null, isMobile: false })).toBe(false)
  })
  it("parses stored timestamps and clamps delay", () => {
    expect(parseStoredTimestamp("abc")).toBeNull()
    expect(parseStoredTimestamp("1700000000000")).toBe(1700000000000)
    expect(popupDelayMs({ ...cfg, delaySeconds: 5 })).toBe(5000)
    expect(popupDelayMs({ ...cfg, delaySeconds: 9999 })).toBe(600_000)
  })
})

describe("JSON-LD", () => {
  it("escapes characters that could break out of the script element", () => {
    const s = serializeJsonLd({ name: "</script><script>alert(1)</script>&" })
    expect(s).not.toContain("<")
    expect(s).not.toContain(">")
    expect(JSON.parse(s)).toEqual({ name: "</script><script>alert(1)</script>&" })
  })
  it("builds Product + Offer + AggregateRating", () => {
    const ld = productJsonLd({ name: "Dress", description: "Nice", handle: "dress", images: ["https://x/a.jpg"], brand: "Adire", price: 68, currency: "usd", inStock: true, rating: { average: 4.5, count: 2 } })
    expect(ld["@type"]).toBe("Product")
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: "68.00", priceCurrency: "USD", availability: "https://schema.org/InStock" })
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 2 })
    const noRating = productJsonLd({ name: "D", description: "", handle: "d", images: [], brand: "B", price: null, currency: "usd", inStock: true, isPreorder: true, rating: { average: null, count: 0 } })
    expect(noRating.aggregateRating).toBeUndefined()
    expect(noRating.offers).toBeUndefined()
  })
  it("builds breadcrumbs and organization", () => {
    const b = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }]) as { itemListElement: { position: number; item: string }[] }
    expect(b.itemListElement[1]).toMatchObject({ position: 2 })
    expect(b.itemListElement[1]!.item).toMatch(/\/shop$/)
    expect(organizationJsonLd()).toMatchObject({ "@type": "Organization", name: "Haanta" })
  })
})

describe("consent, recently viewed, analytics, categories", () => {
  it("round-trips consent", () => {
    expect(parseConsent("analytics,marketing")).toEqual({ analytics: true, marketing: true })
    expect(parseConsent("none")).toEqual({ analytics: false, marketing: false })
    expect(parseConsent(undefined)).toBeNull()
    expect(serializeConsent({ analytics: true, marketing: false })).toBe("analytics")
    expect(serializeConsent({ analytics: false, marketing: false })).toBe("none")
    expect(readConsentCookie("a=1; haanta_consent=analytics%2Cmarketing")).toEqual({ analytics: true, marketing: true })
  })
  it("keeps a deduplicated, capped recently-viewed list", () => {
    const item = (h: string): RecentItem => ({ handle: h, title: h, brand: "b", thumbnail: null })
    let list = [item("a"), item("b")]
    list = pushRecent(list, item("b"))
    expect(list.map((x) => x.handle)).toEqual(["b", "a"])
    expect(pushRecent(list, item("c"), 2).map((x) => x.handle)).toEqual(["c", "b"])
    expect(parseRecent("not json")).toEqual([])
    expect(parseRecent(JSON.stringify([{ handle: "ok", title: "t" }, { handle: "<bad>", title: "t" }, 5]))).toHaveLength(1)
  })
  it("never sends personal data to analytics", () => {
    const out = scrubParams({ currency: "USD", value: 10, items: [{ item_id: "p1", item_name: "Dress", email: "a@b.com" } as never] })
    expect(out).toEqual({ currency: "USD", value: 10, items: [{ item_id: "p1", item_name: "Dress" }] })
    expect(scrubParams({ transaction_id: "someone@example.com" })).toEqual({})
  })
  it("labels categories", () => {
    expect(categoryLabel("women/dresses")).toBe("Women: Dresses")
    expect(categoryLabel("unknown/thing-here")).toBe("Thing Here")
    expect(findCategory("men")?.name).toBe("Men")
  })
})

describe("validateOptionalMeasurements", () => {
  it("accepts an empty form", () => {
    expect(validateOptionalMeasurements({})).toEqual({ ok: true, value: {} })
  })
  it("keeps only the fields filled in, plus notes", () => {
    expect(validateOptionalMeasurements({ bust: "36", waist: " ", notes: " longer sleeves " })).toEqual({ ok: true, value: { bust: 36, notes: "longer sleeves" } })
  })
  it("rejects out-of-range values", () => {
    const r = validateOptionalMeasurements({ hips: "200" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.hips).toMatch(/between 20 and 80/)
  })
  it("ignores keys that are not measurement fields", () => {
    expect(validateOptionalMeasurements({ price: "1" })).toEqual({ ok: true, value: {} })
  })
})
