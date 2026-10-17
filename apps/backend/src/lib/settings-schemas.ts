import { z } from "zod"
import { DEFAULT_SHIPPING_SETTINGS, shippingSettingsSchema } from "@haanta/shipping"
import { DEFAULT_PRICING_SETTINGS, pricingSettingsSchema } from "@haanta/pricing"

/** Everything the admin can change in Settings. Each key is validated on write. */
export const generalSettingsSchema = z.object({
  /** Days after delivery before a ledger entry becomes payable. */
  returnWindowDays: z.number().int().min(0).max(120),
  /** Where vendors ship orders (the Houston hub for US stock and consolidation). */
  hubAddress: z.object({
    name: z.string().min(1).max(100),
    address_1: z.string().min(1).max(200),
    address_2: z.string().max(200).nullable().optional(),
    city: z.string().min(1).max(100),
    province: z.string().min(1).max(100),
    postal_code: z.string().min(1).max(20),
    country_code: z.string().length(2),
    phone: z.string().max(30).nullable().optional(),
  }),
  lowStockThreshold: z.number().int().min(0).max(1000),
  /** Ready-to-wear dispatch promise to the buyer (hours). */
  readyToWearDispatchHours: z.string().max(40),
  /** Days a vendor has to ship a ready-to-wear order to the hub before it is late. */
  vendorShipByDays: z.number().int().min(1).max(60),
  newsletterPopup: z.object({
    enabled: z.boolean(),
    delaySeconds: z.number().int().min(0).max(600),
    /** Show at most once every N days per browser. */
    frequencyDays: z.number().int().min(1).max(365),
    showOnMobile: z.boolean(),
  }),
  /** Stripe Radar risk levels that put an order on hold for review in the admin. */
  radarReviewRiskLevels: z.array(z.enum(["normal", "elevated", "highest"])),
  quoteCacheSeconds: z.number().int().min(0).max(3600),
  dutiesMessage: z.string().max(300),
})
export type GeneralSettings = z.infer<typeof generalSettingsSchema>

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  returnWindowDays: 14,
  // Placeholder hub address; set the real Houston hub in Admin → Settings before launch.
  hubAddress: {
    name: "Haanta Hub",
    address_1: "Set in Admin → Settings",
    address_2: null,
    city: "Houston",
    province: "TX",
    postal_code: "77001",
    country_code: "US",
    phone: null,
  },
  lowStockThreshold: 3,
  readyToWearDispatchHours: "24-48 hrs",
  vendorShipByDays: 5,
  newsletterPopup: { enabled: true, delaySeconds: 20, frequencyDays: 14, showOnMobile: false },
  radarReviewRiskLevels: ["elevated", "highest"],
  quoteCacheSeconds: 300,
  dutiesMessage:
    "Prices include all import duties and taxes for US and Canada orders. No extra charges on delivery.",
}

export const SETTINGS_SCHEMAS = {
  general: { schema: generalSettingsSchema, defaults: DEFAULT_GENERAL_SETTINGS },
  shipping: { schema: shippingSettingsSchema, defaults: DEFAULT_SHIPPING_SETTINGS },
  pricing: { schema: pricingSettingsSchema, defaults: DEFAULT_PRICING_SETTINGS },
} as const

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]["schema"]>
