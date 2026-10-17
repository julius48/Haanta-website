/**
 * Scenario tests for quoteShipping. Expected values are derived from the behaviour of
 * docs/legacy/wix-shipping.js with default settings. One test per scenario.
 */
import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { quoteShipping } from "../src/quote"
import { DEFAULT_SHIPPING_SETTINGS, resolveShippingSettings } from "../src/settings"
import { parseUpsRateResponse } from "../src/adapters/ups"
import {
  MIXED_EXP,
  MIXED_STD,
  NG_EXP,
  NG_STD,
  US_STD,
  cart,
  fixture,
  fxFailing,
  fxHanging,
  fxReturning,
  ng,
  upsCaShipments,
  upsFailing,
  upsReturning,
  upsUsShipments,
  us,
} from "./helpers"

const S = DEFAULT_SHIPPING_SETTINGS
const fx = fxReturning({ NGN: 1500, CAD: 1.37 }) // live rate above the 1,350 cap → capped
const TX = { country: "US", subdivision: "TX", city: "Houston", postalCode: "77001" }
const AK = { country: "US", subdivision: "AK", city: "Anchorage", postalCode: "99501" }
const HI = { country: "US", subdivision: "US-HI", city: "Honolulu", postalCode: "96813" }
const OR = { country: "US", subdivision: "OR", city: "Portland", postalCode: "97201" }
const CA = { country: "CA", subdivision: "ON", city: "Toronto", postalCode: "M5V 2T6" }
const MX = { country: "MX", subdivision: "CMX", city: "Mexico City", postalCode: "06000" }
const GB = { country: "GB", city: "London", postalCode: "SW1A 1AA" }

const summary = (q: Awaited<ReturnType<typeof quoteShipping>>) =>
  q.options.map((o) => ({ code: o.code, title: o.title, price: o.price, currency: o.currency }))

describe("US-only carts to mainland US", () => {
  it("charges the $20 standard fee below $150", async () => {
    const q = await quoteShipping(cart([us(80)]), TX, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([{ code: "standard_rate", title: US_STD, price: "20.00", currency: "USD" }])
    expect(q.options[0]!.deliveryTime).toBe(US_STD)
    expect(q.origin).toBe("us")
  })

  it("is free at or above $150", async () => {
    const atThreshold = await quoteShipping(cart([us(75, { quantity: 2 })]), TX, S, { ups: upsFailing(), fx })
    expect(atThreshold.options[0]!.price).toBe("0.00")
    const above = await quoteShipping(cart([us(160)]), TX, S, { ups: upsFailing(), fx })
    expect(summary(above)).toEqual([{ code: "standard_rate", title: US_STD, price: "0.00", currency: "USD" }])
  })

  it("does not call UPS for mainland US", async () => {
    const ups = upsReturning(upsUsShipments())
    await quoteShipping(cart([us(80)]), TX, S, { ups, fx })
    expect(ups.shop).not.toHaveBeenCalled()
  })
})

describe("US-only carts to UPS territories", () => {
  it("Canada, UPS success: returns every live UPS rate", async () => {
    const q = await quoteShipping(cart([us(80)]), CA, S, { ups: upsReturning(upsCaShipments()), fx })
    expect(summary(q)).toEqual([
      { code: "ups-11", title: "UPS® Standard to Canada", price: "38.90", currency: "USD" },
      { code: "ups-08", title: "UPS® Worldwide Expedited", price: "88.20", currency: "USD" },
      { code: "ups-07", title: "UPS® Worldwide Express", price: "120.00", currency: "USD" },
      { code: "ups-65", title: "UPS® Worldwide Saver", price: "110.40", currency: "USD" },
    ])
    expect(q.options.every((o) => o.deliveryTime === "2-5 working days on orders from the US to Canada")).toBe(true)
  })

  it("Canada, UPS success over $150: Standard to Canada is free", async () => {
    const q = await quoteShipping(cart([us(200)]), CA, S, { ups: upsReturning(upsCaShipments()), fx })
    expect(q.options[0]).toMatchObject({
      code: "ups-11",
      title: "UPS® Standard to Canada (Free Shipping Over $150)",
      price: "0.00",
    })
    expect(q.options[1]!.price).toBe("88.20")
  })

  it("Canada, UPS failure: $35 fallback labelled with the checkout currency", async () => {
    const q = await quoteShipping(cart([us(80)], "CAD"), CA, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([
      { code: "ups-fallback", title: "UPS® Standard to Canada", price: "35.00", currency: "CAD" },
    ])
    expect(q.options[0]!.deliveryTime).toBe("2-5 working days")
  })

  it("Canada, UPS failure over $150: fallback is still charged (Wix behaviour)", async () => {
    const q = await quoteShipping(cart([us(400)]), CA, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("35.00")
  })

  it("Alaska, UPS success: returns live rates, Ground first", async () => {
    const q = await quoteShipping(cart([us(80)]), AK, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(summary(q)).toEqual([
      { code: "ups-03", title: "UPS® Ground", price: "48.27", currency: "USD" },
      { code: "ups-02", title: "UPS® 2nd Day Air", price: "95.10", currency: "USD" },
      { code: "ups-01", title: "UPS® Next Day Air", price: "140.55", currency: "USD" },
    ])
    expect(q.options[0]!.deliveryTime).toBe("2-5 working days on orders from the US")
  })

  it("Alaska, UPS success over $150: Ground is free", async () => {
    const q = await quoteShipping(cart([us(150)]), AK, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(q.options[0]).toMatchObject({ title: "UPS® Ground (Free Shipping Over $150)", price: "0.00" })
  })

  it("Alaska, UPS failure: $22 Ground fallback", async () => {
    const q = await quoteShipping(cart([us(80)]), AK, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([
      { code: "ups-fallback", title: "UPS® Ground (Standard)", price: "22.00", currency: "USD" },
    ])
  })

  it("Hawaii (ISO subdivision US-HI), UPS success", async () => {
    const ups = upsReturning(upsUsShipments())
    const q = await quoteShipping(cart([us(80)]), HI, S, { ups, fx })
    expect(q.options.map((o) => o.code)).toEqual(["ups-03", "ups-02", "ups-01"])
    expect(ups.shop.mock.calls[0]![0].destination.stateCode).toBe("HI")
  })

  it("Hawaii, UPS failure", async () => {
    const q = await quoteShipping(cart([us(80)]), HI, S, { ups: upsFailing(), fx })
    expect(q.options[0]).toMatchObject({ code: "ups-fallback", price: "22.00" })
  })

  it("Oregon, UPS success", async () => {
    const q = await quoteShipping(cart([us(80)]), OR, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(q.options[0]).toMatchObject({ code: "ups-03", price: "48.27" })
  })

  it("Oregon, UPS failure", async () => {
    const q = await quoteShipping(cart([us(80)]), OR, S, { ups: upsFailing(), fx })
    expect(q.options[0]).toMatchObject({ code: "ups-fallback", title: "UPS® Ground (Standard)", price: "22.00" })
  })

  it("names unknown UPS service codes 'Standard Shipping'", async () => {
    const q = await quoteShipping(cart([us(80)]), AK, S, {
      ups: upsReturning([{ serviceCode: "99", monetaryValue: "12.5", currency: "USD" }]),
      fx,
    })
    expect(q.options[0]).toMatchObject({ code: "ups-99", title: "UPS® Standard Shipping", price: "12.5" })
  })

  it("sends one package per line at 2 kg per unit converted to whole pounds", async () => {
    const ups = upsReturning(upsUsShipments())
    await quoteShipping(cart([us(20, { quantity: 3 }), us(30)]), AK, S, { ups, fx })
    expect(ups.shop.mock.calls[0]![0].packages).toEqual([{ weightLbs: 14 }, { weightLbs: 5 }])
  })
})

describe("Nigeria-only carts", () => {
  it("to the US: $20 standard plus FEZ expedited", async () => {
    const q = await quoteShipping(cart([ng(80)]), TX, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([
      { code: "standard_rate", title: NG_STD, price: "20.00", currency: "USD" },
      { code: "expedited_rate", title: NG_EXP, price: "42.17", currency: "USD" },
    ])
    expect(q.options[1]!.meta).toMatchObject({ fezNgn: 70435.95, ngnPerUsd: 1350, origin: "ng" })
  })

  it("to the US over $150: standard is free (threshold uses the whole cart)", async () => {
    const q = await quoteShipping(cart([ng(160)]), TX, S, { ups: upsFailing(), fx })
    expect(q.options.map((o) => o.price)).toEqual(["0.00", "42.17"])
  })

  it("to Alaska: no UPS call, same as mainland", async () => {
    const ups = upsReturning(upsUsShipments())
    const q = await quoteShipping(cart([ng(80)]), AK, S, { ups, fx })
    expect(q.options.map((o) => o.price)).toEqual(["20.00", "42.17"])
    expect(ups.shop).not.toHaveBeenCalled()
  })

  it("to Canada: standard plus expedited", async () => {
    const q = await quoteShipping(cart([ng(80)], "CAD"), CA, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([
      { code: "standard_rate", title: NG_STD, price: "20.00", currency: "CAD" },
      { code: "expedited_rate", title: NG_EXP, price: "42.17", currency: "CAD" },
    ])
  })

  it("to Mexico: expedited only", async () => {
    const q = await quoteShipping(cart([ng(80)]), MX, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([{ code: "expedited_rate", title: NG_EXP, price: "42.17", currency: "USD" }])
  })

  it("uses a live NGN rate below the cap", async () => {
    const q = await quoteShipping(cart([ng(80)]), TX, S, { ups: upsFailing(), fx: fxReturning({ NGN: 1200 }) })
    expect(q.options[1]!.price).toBe("47.45")
  })

  it("falls back to 1,350 when the rate lookup fails", async () => {
    const q = await quoteShipping(cart([ng(80)]), TX, S, { ups: upsFailing(), fx: fxFailing })
    expect(q.options[1]!.price).toBe("42.17")
  })

  it("falls back to 1,350 when the rate lookup times out", async () => {
    const settings = resolveShippingSettings({ fxTimeoutMs: 20 })
    const q = await quoteShipping(cart([ng(80)]), TX, settings, { ups: upsFailing(), fx: fxHanging })
    expect(q.options[1]!.price).toBe("42.17")
  })

  it("sums weight across Nigeria lines to pick the FEZ tier", async () => {
    // 1.5 kg + 2 × 0.5 kg = 2.5 kg → 95,551.96 − 13,500 = 82,051.96 / 1,350 = 60.78
    const q = await quoteShipping(cart([ng(10), ng(10, { weightKg: 0.5, quantity: 2 })]), TX, S, {
      ups: upsFailing(),
      fx,
    })
    expect(q.options[1]!.price).toBe("60.78")
  })
})

describe("mixed carts", () => {
  const mixed = () => cart([us(100), ng(30)]) // subtotal $130

  it("to mainland US: flat standard plus expedited covering Nigeria items", async () => {
    const q = await quoteShipping(mixed(), TX, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([
      { code: "standard_rate", title: MIXED_STD, price: "20.00", currency: "USD" },
      { code: "expedited_rate", title: MIXED_EXP, price: "42.17", currency: "USD" },
    ])
    expect(q.origin).toBe("mixed")
  })

  it("to mainland US over $150: standard is free", async () => {
    const q = await quoteShipping(cart([us(100), ng(60)]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("0.00")
  })

  it("to Canada, UPS success: Standard to Canada rate plus $20", async () => {
    const q = await quoteShipping(mixed(), CA, S, { ups: upsReturning(upsCaShipments()), fx })
    expect(summary(q)).toEqual([
      { code: "standard_rate", title: MIXED_STD, price: "58.90", currency: "USD" },
      { code: "expedited_rate", title: MIXED_EXP, price: "42.17", currency: "USD" },
    ])
  })

  it("to Canada, UPS failure: $35 plus $20", async () => {
    const q = await quoteShipping(mixed(), CA, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("55.00")
  })

  it("to Canada over $150: free and UPS is not called", async () => {
    const ups = upsReturning(upsCaShipments())
    const q = await quoteShipping(cart([us(140), ng(30)]), CA, S, { ups, fx })
    expect(q.options[0]!.price).toBe("0.00")
    expect(ups.shop).not.toHaveBeenCalled()
  })

  it("to Alaska, UPS success: Ground rate plus $20", async () => {
    const q = await quoteShipping(mixed(), AK, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(q.options[0]!.price).toBe("68.27")
  })

  it("to Alaska, UPS failure: $22 plus $20", async () => {
    const q = await quoteShipping(mixed(), AK, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("42.00")
  })

  it("to Hawaii without a Ground rate: cheapest UPS rate plus $20", async () => {
    const shipments = parseUpsRateResponse(fixture("ups-shop-no-ground.json"))
    const q = await quoteShipping(mixed(), HI, S, { ups: upsReturning(shipments), fx })
    expect(q.options[0]!.price).toBe("81.05")
  })

  it("to Oregon, UPS success", async () => {
    const q = await quoteShipping(mixed(), OR, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(q.options.map((o) => o.price)).toEqual(["68.27", "42.17"])
  })

  it("to Mexico: expedited only, mixed title", async () => {
    const q = await quoteShipping(mixed(), MX, S, { ups: upsFailing(), fx })
    expect(summary(q)).toEqual([{ code: "expedited_rate", title: MIXED_EXP, price: "42.17", currency: "USD" }])
  })
})

describe("destinations with no option (legacy gaps)", () => {
  it("US-only cart to Mexico gets no option", async () => {
    const q = await quoteShipping(cart([us(80)]), MX, S, { ups: upsReturning(upsUsShipments()), fx })
    expect(q.options).toEqual([])
  })

  it("any cart outside US, Canada and Mexico gets no option", async () => {
    for (const c of [cart([us(80)]), cart([ng(80)]), cart([us(80), ng(80)])]) {
      const q = await quoteShipping(c, GB, S, { ups: upsFailing(), fx })
      expect(q.options).toEqual([])
    }
  })

  it("an empty cart gets no option", async () => {
    const q = await quoteShipping(cart([]), TX, S, { ups: upsFailing(), fx })
    expect(q.options).toEqual([])
    expect(q.origin).toBeNull()
  })
})

describe("pre-order delivery text", () => {
  it("Nigeria-only pre-order appends 'after production'", async () => {
    const q = await quoteShipping(cart([ng(80, { isPreorder: true })]), TX, S, { ups: upsFailing(), fx })
    expect(q.options.map((o) => o.title)).toEqual([
      "Standard Delivery - Shipping from Nigeria (10-21 days after production)",
      "DHL Expedited Shipping - Shipping from Nigeria (2-3 days after production)",
    ])
  })

  it("US-only pre-order appends 'after production'", async () => {
    const q = await quoteShipping(cart([us(80, { isPreorder: true })]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.title).toBe("Standard Delivery - Shipping from US (2-5 working days after production)")
  })

  it("mixed cart with any pre-order uses '(after prod.)' on both legs", async () => {
    const q = await quoteShipping(cart([us(100), ng(30, { isPreorder: true })]), TX, S, { ups: upsFailing(), fx })
    expect(q.options.map((o) => o.title)).toEqual([
      "Standard Delivery (Shipping from US: 2-5 working days (after prod.) | Shipping from Nigeria: 10-21 days (after prod.))",
      "DHL Expedited Shipping (Shipping from US: 2-3 working days (after prod.) | Shipping from Nigeria: 2-3 days (after prod.))",
    ])
  })

  it("UPS options do not carry production text", async () => {
    const q = await quoteShipping(cart([us(80, { isPreorder: true })]), AK, S, { ups: upsFailing(), fx })
    expect(q.options[0]!.deliveryTime).toBe("2-5 working days")
  })
})

describe("weights", () => {
  it("defaults missing or zero weights to 1.5 kg and reports the lines", async () => {
    // 2 × 1.5 kg (missing) = 3.0 kg → 118,329.27 − 13,500 = 104,829.27 / 1,350 = 77.65
    const a = ng(10, { weightKg: null, quantity: 2 })
    const q = await quoteShipping(cart([a]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("77.65")
    expect(q.defaultedWeightLineIds).toEqual([a.id])
    const z = ng(10, { weightKg: 0 })
    const q2 = await quoteShipping(cart([z]), TX, S, { ups: upsFailing(), fx })
    expect(q2.options[1]!.price).toBe("42.17")
    expect(q2.defaultedWeightLineIds).toEqual([z.id])
  })

  it("exactly 10 kg uses the last tier", async () => {
    // 332,198.74 − 13,500 = 318,698.74 / 1,350 = 236.07
    const q = await quoteShipping(cart([ng(10, { weightKg: 5, quantity: 2 })]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("236.07")
  })

  it("over 10 kg uses the legacy 1,947,509.19 naira fallback", async () => {
    // 1,947,509.19 − 13,500 = 1,934,009.19 / 1,350 = 1,432.60
    const q = await quoteShipping(cart([ng(10, { weightKg: 6, quantity: 2 })]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("1432.60")
    expect(q.options[1]!.meta.fezNgn).toBe(1947509.19)
  })

  it("Houston weights do not count towards FEZ weight", async () => {
    const q = await quoteShipping(cart([us(100, { weightKg: 30 }), ng(30)]), TX, S, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("42.17")
  })
})

describe("gap fixes (off by default)", () => {
  it("usOnlyToMexico: US-only carts to Mexico get UPS rates", async () => {
    const s = resolveShippingSettings({ gapFixes: { usOnlyToMexico: true } })
    const q = await quoteShipping(cart([us(80)]), MX, s, { ups: upsReturning(upsCaShipments()), fx })
    expect(q.options.map((o) => o.code)).toEqual(["ups-11", "ups-08", "ups-07", "ups-65"])
    const fallback = await quoteShipping(cart([us(80)]), MX, s, { ups: upsFailing(), fx })
    expect(fallback.options[0]).toMatchObject({ code: "ups-fallback", price: "60.00" })
  })

  it("restOfWorld: Nigeria items get FEZ expedited and US items get UPS outside North America", async () => {
    const s = resolveShippingSettings({ gapFixes: { restOfWorld: true } })
    const q = await quoteShipping(cart([us(100), ng(30)]), GB, s, { ups: upsFailing(), fx })
    // Mixed: FEZ for Lagos items (42.17) + cheapest UPS for Houston items (international fallback $60)
    expect(q.options.map((o) => [o.code, o.price])).toEqual([["expedited_rate", "102.17"]])
    const ngOnly = await quoteShipping(cart([ng(30)]), GB, s, { ups: upsFailing(), fx })
    expect(ngOnly.options.map((o) => [o.code, o.price])).toEqual([["expedited_rate", "42.17"]])
    const usOnly = await quoteShipping(cart([us(30)]), GB, s, { ups: upsFailing(), fx })
    expect(usOnly.options.map((o) => [o.code, o.price])).toEqual([["ups-fallback", "60.00"]])
  })

  it("convertToCheckoutCurrency: converts USD costs into CAD", async () => {
    const s = resolveShippingSettings({ gapFixes: { convertToCheckoutCurrency: true } })
    const q = await quoteShipping(cart([ng(80)], "CAD"), CA, s, { ups: upsFailing(), fx })
    // 20 × 1.37 = 27.40; 42.1747… × 1.37 = 57.78
    expect(summary(q)).toEqual([
      { code: "standard_rate", title: NG_STD, price: "27.40", currency: "CAD" },
      { code: "expedited_rate", title: NG_EXP, price: "57.78", currency: "CAD" },
    ])
  })

  it("convertToCheckoutCurrency: converts UPS fallback and live rates", async () => {
    const s = resolveShippingSettings({ gapFixes: { convertToCheckoutCurrency: true } })
    const q = await quoteShipping(cart([us(80)], "CAD"), CA, s, { ups: upsFailing(), fx })
    expect(q.options[0]).toMatchObject({ price: "47.95", currency: "CAD" })
    const live = await quoteShipping(cart([us(80)], "CAD"), CA, s, { ups: upsReturning(upsCaShipments()), fx })
    expect(live.options[0]).toMatchObject({ price: "53.29", currency: "CAD" })
  })

  it("upsUseRealWeight: packages use variant weights", async () => {
    const s = resolveShippingSettings({ gapFixes: { upsUseRealWeight: true } })
    const ups = upsReturning(upsUsShipments())
    await quoteShipping(cart([us(20, { quantity: 3, weightKg: 0.4 }), us(30, { weightKg: null })]), AK, s, { ups, fx })
    // 1.2 kg → 2.65 lbs → 3; 1.5 kg default → 3.31 lbs → 4
    expect(ups.shop.mock.calls[0]![0].packages).toEqual([{ weightLbs: 3 }, { weightLbs: 4 }])
  })

  it("fezPerKgAboveMax: per-kg pricing above 10 kg", async () => {
    const s = resolveShippingSettings({ gapFixes: { fezPerKgAboveMax: true } })
    // 12 kg: 332,198.74 + 2 × 32,216.59 = 396,631.92 − 13,500 = 383,131.92 / 1,350 = 283.80
    const q = await quoteShipping(cart([ng(10, { weightKg: 6, quantity: 2 })]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("283.80")
  })

  it("fezPerKgAboveMax with Lozenge Flex tiers uses the tier price", async () => {
    const s = resolveShippingSettings({
      gapFixes: { fezPerKgAboveMax: true },
      lozengeFlexTiers: [{ maxWeightKg: 15, priceNgn: 400000 }],
    })
    const q = await quoteShipping(cart([ng(10, { weightKg: 6, quantity: 2 })]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[1]!.meta.fezNgn).toBe(400000)
  })

  it("freeShippingBasis us_origin_only counts Houston items only", async () => {
    const s = resolveShippingSettings({ freeShippingBasis: "us_origin_only" })
    const q = await quoteShipping(cart([us(100), ng(80)]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("20.00")
  })

  it("free shipping threshold is a setting ($250 per PRD)", async () => {
    const s = resolveShippingSettings({ freeShippingThresholdUsd: 250 })
    const q = await quoteShipping(cart([us(200)]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[0]!.price).toBe("20.00")
    const ca = await quoteShipping(cart([us(260)]), CA, s, { ups: upsReturning(upsCaShipments()), fx })
    expect(ca.options[0]!.title).toBe("UPS® Standard to Canada (Free Shipping Over $250)")
  })

  it("applyDropOffFee adds the naira drop-off fee before the subsidy", async () => {
    const s = resolveShippingSettings({ applyDropOffFee: true })
    // 70,435.95 + 5,000 − 13,500 = 61,935.95 / 1,350 = 45.88
    const q = await quoteShipping(cart([ng(80)]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("45.88")
  })

  it("subsidy larger than the FEZ price floors at zero", async () => {
    const s = resolveShippingSettings({ fezSubsidyNgn: 100000 })
    const q = await quoteShipping(cart([ng(80)]), TX, s, { ups: upsFailing(), fx })
    expect(q.options[1]!.price).toBe("0.00")
  })
})

describe("properties", () => {
  const line = fc.record({
    quantity: fc.integer({ min: 1, max: 5 }),
    unitPriceUsd: fc.integer({ min: 1, max: 500 }),
    location: fc.constantFrom("lagos" as const, "houston" as const),
    isPreorder: fc.boolean(),
    weightKg: fc.option(fc.double({ min: 0.1, max: 8, noNaN: true }), { nil: null }),
  })
  const dest = fc.constantFrom(TX, AK, HI, OR, CA, MX, GB)

  it("is deterministic and never returns negative or non-finite amounts", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(line, { maxLength: 6 }), dest, fc.boolean(), async (lines, d, upsOk) => {
        const c = cart(lines.map((l, i) => ({ id: `l${i}`, ...l })))
        const adapters = () => ({ ups: upsOk ? upsReturning(upsUsShipments()) : upsFailing(), fx })
        const a = await quoteShipping(c, d, S, adapters())
        const b = await quoteShipping(c, d, S, adapters())
        expect(a).toEqual(b)
        for (const o of a.options) {
          expect(Number.isFinite(o.amount)).toBe(true)
          expect(o.amount).toBeGreaterThanOrEqual(0)
          expect(o.amount).toBe(Number(o.price))
        }
      }),
      { numRuns: 200 },
    )
  })
})
