import { z } from "@medusajs/framework/zod"
import { MEASUREMENT_FIELDS } from "../api/middlewares/cart"

/** Image URLs a listing may reference: our Cloudinary account, our local upload host, or migrated Wix media. */
export function isAllowedImageUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:" && u.hostname === "localhost")) return false
  if (u.username || u.password) return false
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  if (u.hostname === "res.cloudinary.com") return !cloud || u.pathname.startsWith(`/${cloud}/`)
  if (u.hostname === "static.wixstatic.com") return u.pathname.startsWith("/media/")
  const backend = process.env.MEDUSA_BACKEND_URL ? new URL(process.env.MEDUSA_BACKEND_URL).host : "localhost:9000"
  return u.host === backend && u.pathname.startsWith("/static/uploads/")
}

const imageUrl = z.string().max(500).refine(isAllowedImageUrl, "Upload images through Haanta")
const measurementKey = z.enum(Object.keys(MEASUREMENT_FIELDS) as [keyof typeof MEASUREMENT_FIELDS, ...(keyof typeof MEASUREMENT_FIELDS)[]])
const shortText = (max: number) => z.string().trim().min(1).max(max)

export const listingVariantSchema = z
  .object({
    title: shortText(120),
    sku: z.string().trim().max(64).regex(/^[A-Za-z0-9._-]*$/, "Letters, numbers, dot, dash and underscore only").optional().nullable(),
    options: z.record(z.string().max(60), z.string().max(80)),
    /** The price the vendor wants to receive, in minor units of `vendor_currency`. */
    vendor_price_minor: z.number().int().positive().max(100_000_000),
    vendor_currency: z.enum(["USD", "NGN"]).default("USD"),
    weight_kg: z.number().positive().max(100).nullable().optional(),
    stock_location: z.enum(["lagos", "houston"]).default("lagos"),
    /** null/undefined = always available (made to order or untracked). */
    quantity: z.number().int().min(0).max(100_000).nullable().optional(),
    fulfilment_type: z.enum(["ready_to_wear", "made_to_order"]).nullable().optional(),
  })
  .strict()

export const listingSnapshotSchema = z
  .object({
    title: shortText(200),
    subtitle: z.string().trim().max(200).nullable().optional(),
    /** Rich text; sanitised with the allow-list sanitiser before storage. */
    description: z.string().max(20_000).default(""),
    material: z.string().trim().max(200).nullable().optional(),
    care: z.string().trim().max(1000).nullable().optional(),
    category_ids: z.array(z.string().max(64)).max(5).default([]),
    images: z.array(imageUrl).max(12).default([]),
    fulfilment_type: z.enum(["ready_to_wear", "made_to_order"]).default("ready_to_wear"),
    lead_time_days: z.number().int().min(1).max(120).nullable().optional(),
    is_preorder: z.boolean().default(false),
    required_measurements: z.array(measurementKey).max(8).default([]),
    size_chart_id: z.string().max(64).nullable().optional(),
    fit_notes: z.string().trim().max(500).nullable().optional(),
    styles: z.array(z.string().max(40)).max(10).default([]),
    options: z.array(z.object({ title: shortText(60), values: z.array(shortText(80)).min(1).max(40) }).strict()).min(1).max(4),
    variants: z.array(listingVariantSchema).min(1).max(100),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.fulfilment_type === "made_to_order" && !s.lead_time_days) {
      ctx.addIssue({ code: "custom", path: ["lead_time_days"], message: "Made-to-order products need a lead time" })
    }
    const titles = new Set(s.options.map((o) => o.title))
    s.variants.forEach((v, i) => {
      for (const [k, val] of Object.entries(v.options)) {
        const opt = s.options.find((o) => o.title === k)
        if (!opt || !opt.values.includes(val)) ctx.addIssue({ code: "custom", path: ["variants", i, "options", k], message: "Unknown option value" })
      }
      if (Object.keys(v.options).length !== titles.size) ctx.addIssue({ code: "custom", path: ["variants", i, "options"], message: "Every option needs a value" })
    })
    const combos = s.variants.map((v) => JSON.stringify(Object.entries(v.options).sort()))
    if (new Set(combos).size !== combos.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Duplicate variant options" })
  })

export type ListingSnapshot = z.infer<typeof listingSnapshotSchema>
export type ListingVariant = z.infer<typeof listingVariantSchema>
