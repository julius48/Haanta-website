import { describe, expect, it } from "vitest"
import { buildSnapshot, cartesian, emptyProductForm, fieldIdForPath, generateVariants, parseList, snapshotToForm, submitProblems, validateSnapshot, type ProductForm } from "../listing"

const BACKEND = "http://localhost:9000"
const IMG = BACKEND + "/static/uploads/vendors/v_1/product/abc.jpg"

function readyForm(patch: Partial<ProductForm> = {}): ProductForm {
  const base = emptyProductForm()
  const options = [{ title: "Size", values: "S, M" }]
  const variants = generateVariants(options, []).map((v) => ({ ...v, price: "68", quantity: "3" }))
  return { ...base, title: "Adire dress", category: "women/dresses", images: [IMG], options, variants, ...patch }
}

describe("parseList", () => {
  it("trims, drops empties and de-duplicates case-insensitively", () => {
    expect(parseList(" S, M ,, m, L ")).toEqual(["S", "M", "L"])
  })
})

describe("variant generation", () => {
  it("builds the cartesian product in option order", () => {
    expect(cartesian([{ title: "Size", values: ["S", "M"] }, { title: "Colour", values: ["Red"] }])).toEqual([
      { Size: "S", Colour: "Red" },
      { Size: "M", Colour: "Red" },
    ])
    expect(cartesian([])).toEqual([])
  })

  it("names variants and ignores options without a title or values", () => {
    const rows = generateVariants(
      [
        { title: "Size", values: "S, M" },
        { title: "Colour", values: "Red, Blue" },
        { title: "", values: "x" },
        { title: "Fit", values: "" },
      ],
      [],
    )
    expect(rows.map((r) => r.title)).toEqual(["S / Red", "S / Blue", "M / Red", "M / Blue"])
    expect(rows[0]!.options).toEqual({ Size: "S", Colour: "Red" })
  })

  it("keeps typed data for surviving combinations and copies defaults to new ones", () => {
    const first = generateVariants([{ title: "Size", values: "S, M" }], []).map((v, i) => ({ ...v, price: i === 0 ? "50" : "55", sku: "SKU-" + i, stock_location: "houston" as const }))
    const next = generateVariants([{ title: "Size", values: "S, M, L" }], first)
    expect(next.map((v) => [v.title, v.price, v.sku])).toEqual([
      ["S", "50", "SKU-0"],
      ["M", "55", "SKU-1"],
      ["L", "50", ""],
    ])
    expect(next[2]!.stock_location).toBe("houston")
  })

  it("caps at 100 variants", () => {
    const many = generateVariants(
      [
        { title: "A", values: Array.from({ length: 20 }, (_, i) => "a" + i).join(",") },
        { title: "B", values: Array.from({ length: 20 }, (_, i) => "b" + i).join(",") },
      ],
      [],
    )
    expect(many).toHaveLength(100)
  })
})

describe("snapshot building and validation (mirrors the backend schema)", () => {
  it("accepts a complete ready-to-wear product", () => {
    const r = validateSnapshot(buildSnapshot(readyForm(), ["pcat_1"]), BACKEND)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.snapshot.variants[0]).toMatchObject({ vendor_price_minor: 6800, vendor_currency: "USD", quantity: 3, stock_location: "lagos", options: { Size: "S" } })
    expect(r.snapshot.category_ids).toEqual(["pcat_1"])
    expect(r.snapshot.description).toBe("")
  })

  it("requires a lead time for made-to-order and treats stock as always available", () => {
    const r = validateSnapshot(buildSnapshot(readyForm({ fulfilment_type: "made_to_order" }), []), BACKEND)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.lead_time_days).toMatch(/lead time/i)
    const ok = validateSnapshot(buildSnapshot(readyForm({ fulfilment_type: "made_to_order", lead_time_days: "14" }), []), BACKEND)
    expect(ok.ok && ok.snapshot.variants.every((v) => v.quantity === null)).toBe(true)
    expect(ok.ok && ok.snapshot.lead_time_days).toBe(14)
  })

  it("reports a missing or malformed price on the variant field", () => {
    const f = readyForm()
    f.variants[1] = { ...f.variants[1]!, price: "" }
    f.variants[0] = { ...f.variants[0]!, price: "12.345" }
    const r = validateSnapshot(buildSnapshot(f, []), BACKEND)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors["variant-0-price"]).toBeDefined()
    expect(r.errors["variant-1-price"]).toBeDefined()
  })

  it("requires every variant to have a value for every option", () => {
    const raw = buildSnapshot(readyForm(), [])
    ;(raw.options as { title: string; values: string[] }[]).push({ title: "Colour", values: ["Red"] })
    const r = validateSnapshot(raw, BACKEND)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors["variant-0-options"]).toMatch(/every option/i)
  })

  it("rejects images that were not uploaded through Haanta", () => {
    const r = validateSnapshot(buildSnapshot(readyForm({ images: ["https://evil.example.com/a.jpg"] }), []), BACKEND)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.images).toMatch(/Haanta/)
    for (const ok of ["https://res.cloudinary.com/haanta/image/upload/x.jpg", "https://static.wixstatic.com/media/x.jpg", IMG]) {
      expect(validateSnapshot(buildSnapshot(readyForm({ images: [ok] }), []), BACKEND).ok).toBe(true)
    }
  })

  it("rejects bad SKUs and empty titles", () => {
    const f = readyForm({ title: "  " })
    f.variants[0] = { ...f.variants[0]!, sku: "bad sku!" }
    const r = validateSnapshot(buildSnapshot(f, []), BACKEND)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.title).toBeDefined()
    expect(r.errors["variant-0-sku"]).toBeDefined()
  })

  it("converts the description to HTML and lower-cases styles", () => {
    const snap = buildSnapshot(readyForm({ description: "Hand **dyed**", styles: "Casual, PARTY" }), [])
    expect(snap.description).toBe("<p>Hand <strong>dyed</strong></p>")
    expect(snap.styles).toEqual(["casual", "party"])
  })

  it("lists submit-only problems", () => {
    expect(submitProblems(readyForm({ images: [], category: "" }))).toEqual({ images: expect.any(String), category: expect.any(String) })
    expect(submitProblems(readyForm())).toEqual({})
  })

  it("round-trips through snapshotToForm", () => {
    const r = validateSnapshot(buildSnapshot(readyForm({ description: "One\n\n- a\n- b" }), []), BACKEND)
    if (!r.ok) throw new Error("expected valid")
    const back = snapshotToForm(r.snapshot, "women/dresses")
    expect(back.variants.map((v) => [v.title, v.price, v.quantity])).toEqual([
      ["S", "68", "3"],
      ["M", "68", "3"],
    ])
    expect(back.options).toEqual([{ title: "Size", values: "S, M" }])
    expect(back.description).toBe("One\n\n- a\n- b")
    expect(validateSnapshot(buildSnapshot(back, []), BACKEND).ok).toBe(true)
  })

  it("maps issue paths to form field ids", () => {
    expect(fieldIdForPath(["variants", 2, "vendor_price_minor"])).toBe("variant-2-price")
    expect(fieldIdForPath(["options", 1, "values", 0])).toBe("option-1-values")
    expect(fieldIdForPath(["category_ids"])).toBe("category")
    expect(fieldIdForPath(["title"])).toBe("title")
  })
})
