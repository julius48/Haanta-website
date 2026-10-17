import { z } from "zod"

/**
 * Every number from the legacy Wix shipping code (docs/legacy/wix-shipping.js) is a setting.
 * Defaults reproduce the Wix behaviour exactly. Gap fixes are off by default.
 */
export const weightTierSchema = z.object({
  maxWeightKg: z.number().positive(),
  priceNgn: z.number().nonnegative(),
})
export type WeightTier = z.infer<typeof weightTierSchema>

const ascendingTiers = z
  .array(weightTierSchema)
  .refine(
    (tiers) => tiers.every((t, i) => i === 0 || t.maxWeightKg > tiers[i - 1]!.maxWeightKg),
    "Tiers must be sorted by ascending maxWeightKg",
  )

export const shippingSettingsSchema = z.object({
  /** FEZ (DHL expedited from Lagos) weight tiers in naira. */
  fezTiers: ascendingTiers,
  /** Legacy flat FEZ price used when Nigeria weight exceeds the last tier (Wix: 1,947,509.19). */
  fezOverMaxFallbackNgn: z.number().nonnegative(),
  /** Lozenge Flex tiers, used above the FEZ tiers only when gapFixes.fezPerKgAboveMax is on. */
  lozengeFlexTiers: ascendingTiers,
  /** Per-kg naira rate above the last tier, used only when gapFixes.fezPerKgAboveMax is on. */
  perKgAboveMaxNgn: z.number().nonnegative(),
  /** Naira subsidy deducted from the FEZ price (Wix: 13,500). */
  fezSubsidyNgn: z.number().nonnegative(),
  /** Naira drop-off/pick-up fee added to the FEZ price when applyDropOffFee is on. */
  dropOffFeeNgn: z.number().nonnegative(),
  applyDropOffFee: z.boolean(),
  /** Maximum NGN per USD used for conversion (Wix: 1,350). Live rates above it are capped. */
  ngnPerUsdCap: z.number().positive(),
  /** Rate used when the live rate lookup times out or fails (Wix: 1,350). */
  ngnPerUsdFallback: z.number().positive(),
  fxTimeoutMs: z.number().int().positive(),
  /** Flat standard fee in USD (Wix: $20). */
  standardFeeUsd: z.number().nonnegative(),
  /** Free standard shipping threshold in USD (Wix: $150; the PRD mentions $250). */
  freeShippingThresholdUsd: z.number().nonnegative(),
  /** cart_total reproduces Wix (whole cart subtotal); us_origin_only counts Houston items only. */
  freeShippingBasis: z.enum(["cart_total", "us_origin_only"]),
  upsFallbackUsd: z.object({ US: z.number().nonnegative(), CA: z.number().nonnegative(), international: z.number().nonnegative() }),
  /** US states that need live UPS rates (Wix: AK, HI, OR). Canada is always a UPS destination. */
  upsExceptionStates: z.array(z.string().length(2)),
  upsExceptionCountries: z.array(z.string().length(2)),
  /** Kilograms assumed per unit for UPS packages (Wix: 2 kg, converted to lbs and rounded up). */
  upsAssumedKgPerUnit: z.number().positive(),
  /** Default weight for variants with no weight (Wix: 1.5 kg). */
  defaultWeightKg: z.number().positive(),
  deliveryText: z.object({
    ngStandard: z.string(),
    ngExpedited: z.string(),
    usStandard: z.string(),
    usExpedited: z.string(),
    upsUs: z.string(),
    upsCanada: z.string(),
    upsFallback: z.string(),
    preorderSuffix: z.string(),
    preorderShortSuffix: z.string(),
  }),
  gapFixes: z.object({
    /** US-only carts to Mexico get UPS rates instead of no option. */
    usOnlyToMexico: z.boolean(),
    /** Carts to countries outside US/CA/MX get UPS (Houston items) and FEZ (Lagos items) options. */
    restOfWorld: z.boolean(),
    /** Convert USD costs into the checkout currency instead of only relabelling them. */
    convertToCheckoutCurrency: z.boolean(),
    /** Use real variant weights for UPS packages instead of upsAssumedKgPerUnit. */
    upsUseRealWeight: z.boolean(),
    /** Use Lozenge Flex tiers / per-kg pricing above the last FEZ tier instead of the flat fallback. */
    fezPerKgAboveMax: z.boolean(),
  }),
})

export type ShippingSettings = z.infer<typeof shippingSettingsSchema>

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  fezTiers: [
    { maxWeightKg: 0.5, priceNgn: 69966.55 },
    { maxWeightKg: 1.0, priceNgn: 70201.25 },
    { maxWeightKg: 1.5, priceNgn: 70435.95 },
    { maxWeightKg: 2.0, priceNgn: 70670.65 },
    { maxWeightKg: 2.5, priceNgn: 95551.96 },
    { maxWeightKg: 3.0, priceNgn: 118329.27 },
    { maxWeightKg: 3.5, priceNgn: 141106.61 },
    { maxWeightKg: 4.0, priceNgn: 167634.98 },
    { maxWeightKg: 4.5, priceNgn: 183192.74 },
    { maxWeightKg: 5.0, priceNgn: 187873.97 },
    { maxWeightKg: 6.0, priceNgn: 219470.29 },
    { maxWeightKg: 7.0, priceNgn: 246307.56 },
    { maxWeightKg: 8.0, priceNgn: 273144.87 },
    { maxWeightKg: 9.0, priceNgn: 299982.15 },
    { maxWeightKg: 10.0, priceNgn: 332198.74 },
  ],
  fezOverMaxFallbackNgn: 1947509.19,
  lozengeFlexTiers: [],
  perKgAboveMaxNgn: 32216.59,
  fezSubsidyNgn: 13500,
  dropOffFeeNgn: 5000,
  applyDropOffFee: false,
  ngnPerUsdCap: 1350,
  ngnPerUsdFallback: 1350,
  fxTimeoutMs: 1000,
  standardFeeUsd: 20,
  freeShippingThresholdUsd: 150,
  freeShippingBasis: "cart_total",
  upsFallbackUsd: { US: 22, CA: 35, international: 60 },
  upsExceptionStates: ["AK", "HI", "OR"],
  upsExceptionCountries: ["CA"],
  upsAssumedKgPerUnit: 2,
  defaultWeightKg: 1.5,
  deliveryText: {
    ngStandard: "10-21 days",
    ngExpedited: "2-3 days",
    usStandard: "2-5 working days",
    usExpedited: "2-3 working days",
    upsUs: "2-5 working days on orders from the US",
    upsCanada: "2-5 working days on orders from the US to Canada",
    upsFallback: "2-5 working days",
    preorderSuffix: " after production",
    preorderShortSuffix: " (after prod.)",
  },
  gapFixes: {
    usOnlyToMexico: false,
    restOfWorld: false,
    convertToCheckoutCurrency: false,
    upsUseRealWeight: false,
    fezPerKgAboveMax: false,
  },
}

/** Merge a partial override (for example from the admin settings store) onto the defaults and validate. */
export function resolveShippingSettings(override: unknown = {}): ShippingSettings {
  const o = (override ?? {}) as Partial<ShippingSettings>
  const merged = {
    ...DEFAULT_SHIPPING_SETTINGS,
    ...o,
    upsFallbackUsd: { ...DEFAULT_SHIPPING_SETTINGS.upsFallbackUsd, ...(o.upsFallbackUsd ?? {}) },
    deliveryText: { ...DEFAULT_SHIPPING_SETTINGS.deliveryText, ...(o.deliveryText ?? {}) },
    gapFixes: { ...DEFAULT_SHIPPING_SETTINGS.gapFixes, ...(o.gapFixes ?? {}) },
  }
  return shippingSettingsSchema.parse(merged)
}
