import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildRedirects, parseCsv, parseCsvObjects, toCsv, transformCatalog } from "../src"

// Same rule as the server: retail = round(vendor × (1 + markup)) to whole dollars, never below the vendor price.
const retailFor = (v: number, bps: number) => {
  const r = Math.floor((v * (10_000 + bps)) / 10_000 / 100 + 0.5) * 100
  return r >= v ? r : Math.ceil(v / 100) * 100
}

const exportPath = join(__dirname, "..", "..", "..", "docs", "catalog-export.csv")
const rows = parseCsvObjects(readFileSync(exportPath, "utf8"))
const result = transformCatalog(rows, { markupBps: 3500, retailFor })

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and newlines, and escapes formulas on output", () => {
    expect(parseCsv('a,b\n"x, y","line1\nline2 ""q"""\n')).toEqual([["a", "b"], ["x, y", 'line1\nline2 "q"']])
    expect(toCsv(["a"], [{ a: "=HYPERLINK(1)" }])).toBe("a\r\n'=HYPERLINK(1)\r\n")
  })
})

describe("Wix catalog export transform", () => {
  it("reads every product and variant row of the export", () => {
    expect(result.stats.products_in_export).toBe(1370)
    expect(result.stats.variants_in_export).toBe(11680)
    expect(result.stats.products_mapped! + result.stats.products_skipped!).toBe(1370)
  })

  it("only skips products whose brand cannot be determined, and reports each one", () => {
    const noBrand = result.review.filter((r) => r.issue === "no_brand")
    expect(noBrand.length).toBe(result.skipped.length)
    // 145 products have an empty brand field; collections and ribbons recover some of them.
    expect(result.skipped.length).toBeLessThanOrEqual(145)
    expect(result.review.filter((r) => r.issue === "brand_inferred").length).toBe(145 - result.skipped.length)
  })

  it("merges duplicate brands", () => {
    const names = result.vendors.map((v) => v.name)
    expect(names).toContain("Simona")
    expect(names).not.toContain("Siimona")
    expect(names).not.toContain("Lola's signature")
    expect(new Set(names).size).toBe(names.length)
  })

  it("maps origins, made-to-order, pre-order and measurements", () => {
    expect(result.products.some((p) => p.origin === "houston")).toBe(true)
    const mto = result.products.filter((p) => p.variants.some((v) => v.fulfilment_type === "made_to_order"))
    expect(mto.length).toBeGreaterThan(50)
    expect(mto.every((p) => p.required_measurements.includes("bust") && p.lead_time_days)).toBe(true)
    expect(result.products.filter((p) => p.is_preorder).length).toBeGreaterThanOrEqual(100)
  })

  it("normalises options: no colour codes in values, colours have text labels", () => {
    for (const p of result.products) {
      for (const v of p.variants) for (const value of Object.values(v.options)) expect(value).not.toMatch(/^#[0-9a-f]{6}/i)
      expect(new Set(p.variants.map((v) => v.title)).size).toBe(p.variants.length)
    }
  })

  it("sanitises description HTML", () => {
    for (const p of result.products) expect(p.description).not.toMatch(/<script|onerror|javascript:/i)
  })

  it("assigns unique handles and a redirect for every Wix product URL", () => {
    expect(new Set(result.products.map((p) => p.handle)).size).toBe(result.products.length)
    const redirects = buildRedirects(result)
    const froms = new Set(redirects.map((r) => r.from))
    const to = new Map(redirects.map((r) => [r.from, r.to]))
    // Every Wix product URL points at its own product (aliases never override a real URL)
    for (const p of result.products) expect(to.get(`/product-page/${p.wix_slug}`)).toBe(`/products/${p.handle}`)
    expect(to.get("/product-page/oceana")).toBe(`/products/${result.products.find((p) => p.wix_handle_id === "ocean")!.handle}`)
    for (const s of result.skipped) expect(froms.has(`/product-page/${s.wix_slug}`)).toBe(true)
    expect(froms.has("/product-page/tor-aso-oke-cap")).toBe(true)
    expect(froms.has("/product-page/tor-aso-oke-cap-1")).toBe(true)
  })

  it("derives per-vendor markups from Wix prices and costs", () => {
    expect(result.vendorMarkups["oyiza"]).toBe(3000)
    expect(result.vendorMarkups["melira"]).toBe(3000)
    for (const bps of Object.values(result.vendorMarkups)) expect(bps).toBeGreaterThanOrEqual(0)
  })

  it("prints a summary", () => {
    const by = (issue: string) => result.review.filter((r) => r.issue === issue).length
    console.log(JSON.stringify({ ...result.stats, vendor_markups: result.vendorMarkups, no_category: by("no_category"), price_change: by("price_change"), vendor_price_derived: by("vendor_price_derived"), missing_weight: by("missing_weight") }))
  })
})
