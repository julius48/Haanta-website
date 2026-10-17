/**
 * Product listing form model, variant generation and the listing snapshot schema.
 * The schema mirrors apps/backend/src/lib/listing-schema.ts (the backend validates again).
 */
import { z } from "zod"
import type { VendorCurrency } from "./money"
import { minorToInput, parsePriceToMinor } from "./money"
import { htmlToLite, liteToHtml } from "./rich-text"

export const MEASUREMENTS = [
  { key: "bust", label: "Bust" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "height", label: "Height" },
  { key: "shoulder", label: "Shoulder width" },
  { key: "arm_length", label: "Arm length" },
  { key: "inseam", label: "Inseam" },
  { key: "dress_length", label: "Dress length" },
] as const
export type MeasurementKey = (typeof MEASUREMENTS)[number]["key"]
const MEASUREMENT_KEYS = MEASUREMENTS.map((m) => m.key) as [MeasurementKey, ...MeasurementKey[]]

export type FulfilmentType = "ready_to_wear" | "made_to_order"
export type StockLocation = "lagos" | "houston"

// ---------------------------------------------------------------- snapshot schema (mirrors backend)

/** Images must be Haanta-uploaded: our Cloudinary, migrated Wix media, or the backend's upload host. */
export function isHaantaImageUrl(url: string, backendUrl: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.username || u.password) return false
  if (u.protocol === "https:" && u.hostname === "res.cloudinary.com") return true
  if (u.protocol === "https:" && u.hostname === "static.wixstatic.com") return u.pathname.startsWith("/media/")
  try {
    const b = new URL(backendUrl)
    return u.protocol === b.protocol && u.host === b.host && u.pathname.startsWith("/static/uploads/")
  } catch {
    return false
  }
}

const shortText = (max: number, label: string) => z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`)

export const listingVariantSchema = z
  .object({
    title: shortText(120, "Variant name"),
    sku: z
      .string()
      .trim()
      .max(64, "SKU must be 64 characters or fewer")
      .regex(/^[A-Za-z0-9._-]*$/, "SKU: letters, numbers, dot, dash and underscore only")
      .optional()
      .nullable(),
    options: z.record(z.string().max(60), z.string().max(80)),
    vendor_price_minor: z.number({ error: "Enter a price" }).int().positive("Enter a price above zero").max(100_000_000, "Price is too high"),
    vendor_currency: z.enum(["USD", "NGN"]),
    weight_kg: z.number().positive("Weight must be above zero").max(100, "Weight must be 100 kg or less").nullable().optional(),
    stock_location: z.enum(["lagos", "houston"]),
    quantity: z.number().int("Stock must be a whole number").min(0, "Stock can't be negative").max(100_000, "Stock is too high").nullable().optional(),
    fulfilment_type: z.enum(["ready_to_wear", "made_to_order"]).nullable().optional(),
  })
  .strict()

export function listingSnapshotSchema(backendUrl: string) {
  return z
    .object({
      title: shortText(200, "Title"),
      subtitle: z.string().trim().max(200, "Subtitle must be 200 characters or fewer").nullable().optional(),
      description: z.string().max(20_000, "Description is too long"),
      material: z.string().trim().max(200, "Material must be 200 characters or fewer").nullable().optional(),
      care: z.string().trim().max(1000, "Care must be 1000 characters or fewer").nullable().optional(),
      category_ids: z.array(z.string().max(64)).max(5),
      images: z.array(z.string().max(500).refine((u) => isHaantaImageUrl(u, backendUrl), "Upload images through Haanta")).max(12, "Up to 12 photos"),
      fulfilment_type: z.enum(["ready_to_wear", "made_to_order"]),
      lead_time_days: z.number().int("Lead time must be whole days").min(1, "Lead time must be at least 1 day").max(120, "Lead time must be 120 days or less").nullable().optional(),
      is_preorder: z.boolean(),
      required_measurements: z.array(z.enum(MEASUREMENT_KEYS)).max(8),
      size_chart_id: z.string().max(64).nullable().optional(),
      fit_notes: z.string().trim().max(500, "Fit notes must be 500 characters or fewer").nullable().optional(),
      styles: z.array(z.string().max(40, "Each style must be 40 characters or fewer")).max(10, "Up to 10 styles"),
      options: z
        .array(z.object({ title: shortText(60, "Option name"), values: z.array(shortText(80, "Option value")).min(1, "Add at least one value").max(40, "Up to 40 values") }).strict())
        .min(1, "Add at least one option (for example Size)")
        .max(4, "Up to 4 options"),
      variants: z.array(listingVariantSchema).min(1, "Add at least one variant").max(100, "Up to 100 variants"),
    })
    .strict()
    .superRefine((s, ctx) => {
      if (s.fulfilment_type === "made_to_order" && !s.lead_time_days) {
        ctx.addIssue({ code: "custom", path: ["lead_time_days"], message: "Made-to-order products need a lead time" })
      }
      const titles = new Set(s.options.map((o) => o.title))
      if (titles.size !== s.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Option names must be different" })
      s.variants.forEach((v, i) => {
        for (const [k, val] of Object.entries(v.options)) {
          const opt = s.options.find((o) => o.title === k)
          if (!opt || !opt.values.includes(val)) ctx.addIssue({ code: "custom", path: ["variants", i, "options", k], message: "Unknown option value" })
        }
        if (Object.keys(v.options).length !== titles.size) ctx.addIssue({ code: "custom", path: ["variants", i, "options"], message: "Every option needs a value" })
      })
      const combos = s.variants.map((v) => JSON.stringify(Object.entries(v.options).sort()))
      if (new Set(combos).size !== combos.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Two variants have the same options" })
    })
}

export type ListingSnapshot = z.infer<ReturnType<typeof listingSnapshotSchema>>
export type ListingVariant = z.infer<typeof listingVariantSchema>

// ---------------------------------------------------------------- form model

export interface OptionRow {
  title: string
  /** Comma-separated values as typed. */
  values: string
}

export interface VariantRow {
  /** Stable key from the option combination. */
  key: string
  options: Record<string, string>
  title: string
  sku: string
  price: string
  weight: string
  stock_location: StockLocation
  always_available: boolean
  quantity: string
}

export interface ProductForm {
  title: string
  subtitle: string
  /** Light-marks text; converted to HTML on save. */
  description: string
  material: string
  care: string
  /** Category path from lib/categories.ts, or "". */
  category: string
  images: string[]
  fulfilment_type: FulfilmentType
  lead_time_days: string
  is_preorder: boolean
  required_measurements: MeasurementKey[]
  size_chart_id: string
  fit_notes: string
  /** Comma-separated style tags. */
  styles: string
  currency: VendorCurrency
  options: OptionRow[]
  variants: VariantRow[]
}

export function emptyProductForm(): ProductForm {
  const options: OptionRow[] = [{ title: "Size", values: "" }]
  return {
    title: "",
    subtitle: "",
    description: "",
    material: "",
    care: "",
    category: "",
    images: [],
    fulfilment_type: "ready_to_wear",
    lead_time_days: "",
    is_preorder: false,
    required_measurements: [],
    size_chart_id: "",
    fit_notes: "",
    styles: "",
    currency: "USD",
    options,
    variants: [],
  }
}

/** "S, M , L,, M" → ["S", "M", "L"] */
export function parseList(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(",")) {
    const v = raw.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

export function parsedOptions(rows: OptionRow[]): { title: string; values: string[] }[] {
  return rows.map((r) => ({ title: r.title.trim(), values: parseList(r.values) })).filter((o) => o.title && o.values.length)
}

export function variantKey(options: Record<string, string>, order: string[]): string {
  return JSON.stringify(order.map((t) => [t, options[t] ?? ""]))
}

/** Every combination of option values, in option order. */
export function cartesian(options: { title: string; values: string[] }[]): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}]
  for (const o of options) {
    const next: Record<string, string>[] = []
    for (const c of combos) for (const v of o.values) next.push({ ...c, [o.title]: v })
    combos = next
  }
  return options.length ? combos : []
}

export const MAX_VARIANTS = 100

/**
 * Rebuild variant rows from the options, keeping what the vendor already typed for combinations
 * that still exist. New rows copy price, weight and ships-from from the first existing row.
 */
export function generateVariants(rows: OptionRow[], existing: VariantRow[]): VariantRow[] {
  const options = parsedOptions(rows)
  const order = options.map((o) => o.title)
  const byKey = new Map(existing.map((v) => [variantKey(v.options, order), v]))
  const template = existing[0]
  return cartesian(options)
    .slice(0, MAX_VARIANTS)
    .map((combo) => {
      const key = variantKey(combo, order)
      const title = order.map((t) => combo[t]).join(" / ")
      const prev = byKey.get(key)
      if (prev) return { ...prev, key, options: combo, title }
      return {
        key,
        options: combo,
        title,
        sku: "",
        price: template?.price ?? "",
        weight: template?.weight ?? "",
        stock_location: template?.stock_location ?? "lagos",
        always_available: template?.always_available ?? false,
        quantity: "",
      }
    })
}

function optionalText(s: string): string | null {
  const t = s.trim()
  return t ? t : null
}

/** "" → null; invalid → NaN (so validation reports it). */
function optionalNumber(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** Form → listing snapshot (before validation). Category ids are resolved on the server. */
export function buildSnapshot(form: ProductForm, categoryIds: string[]): Record<string, unknown> {
  const options = parsedOptions(form.options)
  return {
    title: form.title.trim(),
    subtitle: optionalText(form.subtitle),
    description: liteToHtml(form.description),
    material: optionalText(form.material),
    care: optionalText(form.care),
    category_ids: categoryIds,
    images: form.images,
    fulfilment_type: form.fulfilment_type,
    lead_time_days: form.fulfilment_type === "made_to_order" ? optionalNumber(form.lead_time_days) : null,
    is_preorder: form.is_preorder,
    required_measurements: form.required_measurements,
    size_chart_id: optionalText(form.size_chart_id),
    fit_notes: optionalText(form.fit_notes),
    styles: parseList(form.styles).map((s) => s.toLowerCase()),
    options,
    variants: form.variants.map((v) => ({
      title: v.title,
      sku: optionalText(v.sku),
      options: v.options,
      vendor_price_minor: parsePriceToMinor(v.price) ?? (v.price.trim() ? NaN : undefined),
      vendor_currency: form.currency,
      weight_kg: optionalNumber(v.weight),
      stock_location: v.stock_location,
      quantity: v.always_available || form.fulfilment_type === "made_to_order" ? null : (optionalNumber(v.quantity) ?? 0),
      fulfilment_type: null,
    })),
  }
}

export type FieldErrors = Record<string, string>

/** Map a snapshot issue path to the id of the form control that shows it. */
export function fieldIdForPath(path: readonly PropertyKey[]): string {
  const [head, i, field] = path
  if (head === "variants" && typeof i === "number") {
    const map: Record<string, string> = { vendor_price_minor: "price", weight_kg: "weight", quantity: "quantity", sku: "sku", title: "title" }
    const f = typeof field === "string" ? (map[field] ?? "options") : "options"
    return `variant-${i}-${f}`
  }
  if (head === "options" && typeof i === "number") return field === "title" ? `option-${i}-title` : `option-${i}-values`
  if (head === "category_ids") return "category"
  if (head === "lead_time_days") return "lead_time_days"
  return typeof head === "string" ? head : "form"
}

export type SnapshotResult = { ok: true; snapshot: ListingSnapshot } | { ok: false; errors: FieldErrors }

export function validateSnapshot(raw: Record<string, unknown>, backendUrl: string): SnapshotResult {
  const parsed = listingSnapshotSchema(backendUrl).safeParse(raw)
  if (parsed.success) return { ok: true, snapshot: parsed.data }
  const errors: FieldErrors = {}
  for (const issue of parsed.error.issues) {
    const id = fieldIdForPath(issue.path)
    if (!errors[id]) errors[id] = issue.code === "invalid_type" && id.endsWith("-price") ? "Enter a price, e.g. 68 or 68.50" : issue.message
  }
  return { ok: false, errors }
}

/** Extra checks the backend applies when a product is submitted for review. */
export function submitProblems(form: ProductForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.images.length) errors.images = "Add at least one photo before submitting"
  if (!form.category) errors.category = "Choose a category before submitting"
  return errors
}

/** API snapshot → editable form. */
export function snapshotToForm(s: Partial<ListingSnapshot> | null | undefined, categoryPath: string): ProductForm {
  if (!s) return { ...emptyProductForm(), category: categoryPath }
  const options = (s.options ?? []).map((o) => ({ title: o.title, values: o.values.join(", ") }))
  const order = (s.options ?? []).map((o) => o.title)
  const variants = (s.variants ?? []).map<VariantRow>((v) => ({
    key: variantKey(v.options, order),
    options: v.options,
    title: v.title,
    sku: v.sku ?? "",
    price: minorToInput(v.vendor_price_minor),
    weight: v.weight_kg != null ? String(v.weight_kg) : "",
    stock_location: v.stock_location ?? "lagos",
    always_available: v.quantity == null,
    quantity: v.quantity != null ? String(v.quantity) : "",
  }))
  return {
    title: s.title ?? "",
    subtitle: s.subtitle ?? "",
    description: htmlToLite(s.description),
    material: s.material ?? "",
    care: s.care ?? "",
    category: categoryPath,
    images: s.images ?? [],
    fulfilment_type: s.fulfilment_type ?? "ready_to_wear",
    lead_time_days: s.lead_time_days != null ? String(s.lead_time_days) : "",
    is_preorder: s.is_preorder ?? false,
    required_measurements: (s.required_measurements ?? []) as MeasurementKey[],
    size_chart_id: s.size_chart_id ?? "",
    fit_notes: s.fit_notes ?? "",
    styles: (s.styles ?? []).join(", "),
    currency: s.variants?.[0]?.vendor_currency ?? "USD",
    options: options.length ? options : [{ title: "Size", values: "" }],
    variants,
  }
}
