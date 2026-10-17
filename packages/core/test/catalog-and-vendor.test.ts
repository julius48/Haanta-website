import { describe, expect, it } from "vitest"
import {
  assertNoBuyerPii,
  canonicalBrand,
  classifyCollections,
  inferCategory,
  isMadeToOrderValue,
  normaliseOption,
  parseImages,
  parseSize,
  parseSizeChartTable,
  parseWixInventory,
  parseWeightKg,
  slugify,
  splitCollections,
  toVendorOrderView,
  wixProductSlugs,
} from "../src"

describe("brands", () => {
  it("merges duplicate spellings", () => {
    expect(canonicalBrand("Siimona")?.name).toBe("Simona")
    expect(canonicalBrand("Simona")?.slug).toBe("simona")
    expect(canonicalBrand("Lola's signature")?.name).toBe("Lola Signatures")
    expect(canonicalBrand("Fiibii  Studio")?.name).toBe("Fiibii Studio")
    expect(canonicalBrand("ÀÁDÙN")?.slug).toBe("aadun")
    expect(canonicalBrand("AvrilbyWk")?.name).toBe("Avril by WK")
    expect(canonicalBrand("Ulaku finds")?.name).toBe("Ulaku Finds")
    expect(canonicalBrand("Unknown Label")).toBeNull()
    expect(canonicalBrand("")).toBeNull()
  })
})

describe("collections", () => {
  it("splits one Wix field into brand, origin, promotions, shops, styles and categories", () => {
    const c = classifyCollections(splitCollections("Discover;Dresses;Women;New Arrivals;Soso Lagos;Black Friday Sale;Vacay Bae;Shipped from US;Party"))
    expect(c.brand?.name).toBe("Soso Lagos")
    expect(c.origin).toBe("houston")
    expect(c.promotions).toEqual(["black-friday"])
    expect(c.shops).toEqual(["vacay-bae"])
    expect(c.styles).toEqual(["party"])
    expect(c.merch).toEqual(["discover", "new-arrival"])
    expect(c.gender).toBe("women")
    expect(c.unknown).toEqual([])
  })

  it("prefers Houston when both origins are present", () => {
    expect(classifyCollections(["Shipped From Nigeria", "Haanta Houston Stock"]).origin).toBe("houston")
    expect(classifyCollections(["Shipped From Nigeria"]).origin).toBe("lagos")
    expect(classifyCollections([]).origin).toBeNull()
  })

  it("reports unknown collections for the review CSV", () => {
    expect(classifyCollections(["Mystery Shelf"]).unknown).toEqual(["Mystery Shelf"])
  })
})

describe("categories", () => {
  const cat = (name: string, cols: string[]) => inferCategory(name, classifyCollections(cols))?.handle
  it("uses name keywords before bulk-applied collections", () => {
    expect(cat("Main Character Earrings", ["Artwork", "Bottoms", "Accessories", "Women"])).toBe("accessories/jewellery")
    expect(cat("Gingham Bloom Sandals", ["Artwork", "Bottoms"])).toBe("accessories/shoes")
    expect(cat("Laya Stool", ["Heavy Items", "Bottoms", "Artwork"])).toBe("home/furniture")
    expect(cat("Soso Bubble Skirt Set", ["Bottoms", "Women"])).toBe("women/sets")
    expect(cat("Ama Lace Dress", ["Two- Piece Sets", "Women"])).toBe("women/dresses")
    expect(cat("Tux Pant", ["Men", "Suits/Jacket"])).toBe("men/bottoms")
    expect(cat("Orodje Jacket", ["Men", "Suits/Jacket"])).toBe("men/jackets")
    expect(cat("Tor Aso Oke Cap", ["Men"])).toBe("accessories/headwear")
    expect(cat("Line Art Jalabiya and Cap Set", [])).toBe("men/sets")
    expect(cat("Rumi Jumpsuit - Kids", ["Kids"])).toBe("kids")
  })

  it("falls back to collections, then gender, then weak collections", () => {
    expect(cat("Oceana", ["Dresses", "Women"])).toBe("women/dresses")
    expect(cat("Barbara Print", ["Women"])).toBe("women")
    expect(cat("Oba", ["Artwork"])).toBe("home/art")
    expect(inferCategory("Oba — Tea", classifyCollections(["Discover"]))).toBeNull()
  })
})

describe("options", () => {
  it("normalises the inconsistent size option names", () => {
    for (const n of ["Size", "Sizes", "Size US", "Size (US)", "Size(US)", "Size(UK)", "Size Number"]) {
      expect(normaliseOption(n, "DROP_DOWN", "S;M").kind).toBe("size")
    }
    expect(normaliseOption("Apparel", "DROP_DOWN", "Both;Top;Pant")).toMatchObject({ kind: "piece", title: "Piece" })
    expect(normaliseOption("Order Type", "DROP_DOWN", "ready to wear;made to order").kind).toBe("fulfilment")
  })

  it("gives colours text labels and keeps swatches", () => {
    expect(normaliseOption("Color", "COLOR", "#E1AD01:Mustard;#FFC0CB:Pink").values).toEqual([
      { value: "Mustard", label: "Mustard", swatch: "#e1ad01" },
      { value: "Pink", label: "Pink", swatch: "#ffc0cb" },
    ])
  })

  it("strips colour codes that leaked into size values", () => {
    const o = normaliseOption("Size", "COLOR", "#000000:M / UK 12 / US 8")
    expect(o.values[0]).toMatchObject({ value: "M / UK 12 / US 8", size: { alpha: "M", uk: "12", us: "8" } })
    expect(o.values[0]!.swatch).toBeUndefined()
  })

  it("parses US/UK sizes", () => {
    expect(parseSize("US 6", "sizeus")).toEqual({ label: "US 6", us: "6", custom: false })
    expect(parseSize("8", "sizeuk")).toEqual({ label: "8", uk: "8", custom: false })
    expect(parseSize("XXS / UK 4 / US 0")).toEqual({ label: "XXS / UK 4 / US 0", alpha: "XXS", uk: "4", us: "0", custom: false })
    expect(parseSize("Custom Sizing").custom).toBe(true)
  })

  it("identifies made-to-order variants", () => {
    expect(isMadeToOrderValue("size", "Custom")).toBe(true)
    expect(isMadeToOrderValue("fulfilment", "made to order")).toBe(true)
    expect(isMadeToOrderValue("fulfilment", "ready to wear")).toBe(false)
    expect(isMadeToOrderValue("color", "Custom")).toBe(false)
  })
})

describe("fields", () => {
  it("maps Wix media ids to URLs and rejects anything else", () => {
    expect(parseImages("a3919b_67~mv2.webp;a3919b_8d~mv2.webp")).toEqual([
      "https://static.wixstatic.com/media/a3919b_67~mv2.webp",
      "https://static.wixstatic.com/media/a3919b_8d~mv2.webp",
    ])
    expect(parseImages("https://evil.example/x.png;../../etc")).toEqual([])
  })

  it("parses inventory and weights", () => {
    expect(parseWixInventory("InStock")).toEqual({ manage: false })
    expect(parseWixInventory("OutOfStock")).toEqual({ manage: true, quantity: 0 })
    expect(parseWixInventory("3")).toEqual({ manage: true, quantity: 3 })
    expect(parseWeightKg("")).toBeNull()
    expect(parseWeightKg("0")).toBeNull()
    expect(parseWeightKg("2.5")).toBe(2.5)
  })

  it("reproduces Wix product page slugs including duplicates", () => {
    expect(wixProductSlugs(["Tor Aso Oke Cap", "Oceana", "Tor Aso Oke Cap"])).toEqual(["tor-aso-oke-cap", "oceana", "tor-aso-oke-cap-1"])
    expect(slugify("Ozoza Women’s Floral Top & Skirt")).toBe("ozoza-womens-floral-top-and-skirt")
  })

  it("parses Wix size chart tables", () => {
    const html = "<table><tbody><tr><td>&nbsp;</td><td>UK</td><td>US</td><td>EU</td><td>Bust</td><td>Waist&nbsp;</td></tr><tr><td>XS</td><td>4</td><td>0</td><td>32</td><td>30</td><td>22</td></tr></tbody></table>"
    expect(parseSizeChartTable(html)).toEqual([{ label: "XS", uk: "4", us: "0", eu: "32", measurements: { bust: "30", waist: "22" } }])
    expect(parseSizeChartTable("<p>no table</p>")).toEqual([])
  })
})

describe("vendor order view", () => {
  const hub = { name: "Haanta Hub", address_1: "1 Hub St", city: "Houston", province: "TX", postal_code: "77001", country_code: "US" }
  const order = {
    id: "order_1",
    display_id: 1042,
    created_at: "2026-10-01T00:00:00Z",
    vendor_status: "accepted",
    email: "buyer@example.com",
    customer: { first_name: "Adaeze", last_name: "Okafor", phone: "+15550001111" },
    shipping_address: { first_name: "Adaeze", address_1: "12 Allen Avenue", city: "Austin" },
    lines: [
      {
        id: "li_1",
        product_title: "Oceana",
        variant_title: "Custom",
        quantity: 2,
        vendor_price_minor: 4500,
        options: { Size: "Custom" },
        measurements: { bust: 36, waist: "30", "<script>": "x", notes: "x".repeat(200) },
        fulfilment_type: "made_to_order",
      },
    ],
  }

  it("contains items, sizes, measurements and the hub address, and no buyer data", () => {
    const view = toVendorOrderView(order, hub)
    expect(view.ship_to).toEqual(hub)
    expect(view.lines[0]).toMatchObject({ quantity: 2, line_total_minor: 9000, measurements: { bust: 36, waist: "30" }, options: { Size: "Custom" } })
    expect(view.total_minor).toBe(9000)
    expect(() =>
      assertNoBuyerPii(view, { email: order.email, names: ["Adaeze", "Okafor"], phone: "+15550001111", address_lines: ["12 Allen Avenue"] }),
    ).not.toThrow()
  })

  it("the PII guard catches leaks", () => {
    expect(() => assertNoBuyerPii({ note: "for adaeze" }, { names: ["Adaeze"] })).toThrow()
    expect(() => assertNoBuyerPii({ email: "x" }, {})).toThrow(/Forbidden field/)
    expect(() => assertNoBuyerPii(order, { email: "buyer@example.com" })).toThrow()
  })
})
