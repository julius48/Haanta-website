import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { approvedTextPairs, contrastRatio, meetsAA, palette, toCssVariables } from "../src"

describe("brand palette", () => {
  it("matches the brand guide", () => {
    expect(palette.brown).toBe("#522b08")
    expect(palette.tan).toBe("#d2b48c")
    expect(palette.red).toBe("#a52a2a")
    expect(palette.gradientFrom).toBe("#8b4512")
    expect(palette.gradientTo).toBe("#502404")
  })
})

describe("WCAG 2.2 AA contrast", () => {
  it.each(approvedTextPairs)("$name passes AA", ({ fg, bg, large }) => {
    expect(meetsAA(fg, bg, large)).toBe(true)
  })

  it("tan text on white fails, so it is not an approved pair", () => {
    expect(meetsAA(palette.tan, palette.white)).toBe(false)
    expect(approvedTextPairs.some((p) => p.fg === palette.tan && p.bg === palette.white)).toBe(false)
  })

  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrastRatio(palette.tan, palette.brown)).toBeGreaterThan(6)
  })
})

describe("tokens.css", () => {
  it("is generated from tokens.ts (run pnpm --filter @haanta/ui gen:css)", () => {
    const css = readFileSync(join(__dirname, "..", "src", "tokens.css"), "utf8")
    expect(css).toBe(toCssVariables())
  })
})
