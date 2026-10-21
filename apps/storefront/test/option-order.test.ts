import { describe, expect, it } from "vitest"
import { sortOptionValues } from "@/lib/option-order"

const vals = (...v: string[]) => v.map((value) => ({ value }))
const order = (title: string, ...v: string[]) => sortOptionValues(title, vals(...v)).map((x) => x.value)

describe("sortOptionValues", () => {
  it("sorts numeric sizes ascending", () => {
    expect(order("Size", "US 16", "US 8", "US 4", "US 10", "US 18", "US 12", "US 14", "US 6")).toEqual(["US 4", "US 6", "US 8", "US 10", "US 12", "US 14", "US 16", "US 18"])
  })

  it("sorts letter sizes smallest to largest, before numbers and free text", () => {
    expect(order("Size", "XL", "One size", "S", "2XL", "M", "XS", "L")).toEqual(["XS", "S", "M", "L", "XL", "2XL", "One size"])
  })

  it("reads letter sizes with a region label", () => {
    expect(order("Size", "UK L", "UK S", "UK M")).toEqual(["UK S", "UK M", "UK L"])
  })

  it("leaves non-size options in catalog order", () => {
    expect(order("Colour", "Red", "Blue", "Amber")).toEqual(["Red", "Blue", "Amber"])
  })
})
