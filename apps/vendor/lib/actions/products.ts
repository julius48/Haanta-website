"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { isKnownCategory } from "../categories"
import { buildSnapshot, MEASUREMENTS, validateSnapshot, type ProductForm } from "../listing"
import { parsePriceToMinor } from "../money"
import type { ListingView, PricePreview } from "../types"
import { isAcceptedImageType, MAX_UPLOAD_BYTES, type UploadSignature } from "../upload"
import { BACKEND_URL } from "../server/api"
import { categoryIdsForPaths } from "../server/categories"
import { RESOURCE_ID } from "../server/forms"
import { mutate, type ActionResult } from "../server/session"

const t = (max: number) => z.string().max(max)
const measurementKeys = MEASUREMENTS.map((m) => m.key) as [string, ...string[]]

/** Shape check for what the browser sends; the snapshot schema then checks the content. */
const productFormSchema = z
  .object({
    title: t(300),
    subtitle: t(300),
    description: t(20_000),
    material: t(300),
    care: t(1200),
    category: t(80),
    images: z.array(t(500)).max(12),
    fulfilment_type: z.enum(["ready_to_wear", "made_to_order"]),
    lead_time_days: t(10),
    is_preorder: z.boolean(),
    required_measurements: z.array(z.enum(measurementKeys)).max(8),
    size_chart_id: t(64),
    fit_notes: t(600),
    styles: t(600),
    currency: z.enum(["USD", "NGN"]),
    options: z.array(z.object({ title: t(80), values: t(4000) }).strict()).max(4),
    variants: z
      .array(
        z
          .object({
            key: t(2000),
            options: z.record(t(80), t(100)),
            title: t(200),
            sku: t(80),
            price: t(30),
            weight: t(20),
            stock_location: z.enum(["lagos", "houston"]),
            always_available: z.boolean(),
            quantity: t(20),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()

export type SaveIntent = "save" | "submit"

/**
 * Save a listing (create or update) and optionally submit it for review. Prices are what the vendor
 * wants to receive; storefront prices are always computed by the backend.
 */
export async function saveProductAction(id: string | null, input: ProductForm, intent: SaveIntent): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !RESOURCE_ID.test(id)) return { ok: false, error: "Unknown product" }
  const parsedForm = productFormSchema.safeParse(input)
  if (!parsedForm.success) return { ok: false, error: "Some fields are not valid. Check the form and try again." }
  const form = parsedForm.data as ProductForm
  if (form.category && !isKnownCategory(form.category)) return { ok: false, error: "Choose a category from the list", fieldErrors: { category: "Choose a category from the list" } }

  let categoryIds: string[]
  try {
    categoryIds = await categoryIdsForPaths(form.category ? [form.category] : [])
  } catch {
    return { ok: false, error: "We couldn't load categories right now. Please try again.", fieldErrors: { category: "Categories are unavailable right now" } }
  }
  const result = validateSnapshot(buildSnapshot(form, categoryIds), BACKEND_URL)
  if (!result.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: result.errors }

  const saved = await mutate<{ product: ListingView }>(id ? `/vendor/products/${id}` : "/vendor/products", { method: "POST", body: { snapshot: result.snapshot } })
  if (!saved.ok) return saved
  const productId = saved.data.product.id

  if (intent === "submit" && !saved.data.product.is_live) {
    const submitted = await mutate<{ product: ListingView }>(`/vendor/products/${productId}/submit`, { method: "POST" })
    if (!submitted.ok) {
      revalidatePath("/products")
      return { ok: false, error: `Saved, but not submitted: ${submitted.error}`, fieldErrors: { form: submitted.error } }
    }
  }
  revalidatePath("/products")
  revalidatePath(`/products/${productId}`)
  redirect(`/products/${productId}?${intent === "submit" ? "submitted" : "saved"}=1`)
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  if (!RESOURCE_ID.test(id)) return { ok: false, error: "Unknown product" }
  const r = await mutate(`/vendor/products/${id}`, { method: "DELETE" })
  if (!r.ok) return r
  revalidatePath("/products")
  redirect("/products?deleted=1")
}

const previewSchema = z.object({
  category: t(80),
  currency: z.enum(["USD", "NGN"]),
  prices: z.array(t(30)).min(1).max(100),
})

/** Storefront price preview (USD and CAD) for each variant, computed by the backend. */
export async function previewPricesAction(input: { category: string; currency: "USD" | "NGN"; prices: string[] }): Promise<ActionResult<PricePreview[]>> {
  const parsed = previewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Enter a price for each variant to see storefront prices." }
  const minor = parsed.data.prices.map(parsePriceToMinor)
  if (minor.some((m) => m === null)) return { ok: false, error: "Enter a price for each variant to see storefront prices." }
  let categoryIds: string[] = []
  try {
    if (parsed.data.category && isKnownCategory(parsed.data.category)) categoryIds = await categoryIdsForPaths([parsed.data.category])
  } catch {
    categoryIds = []
  }
  const r = await mutate<{ prices: PricePreview[] }>("/vendor/pricing/preview", {
    method: "POST",
    body: { category_ids: categoryIds, variants: minor.map((m) => ({ vendor_price_minor: m as number, vendor_currency: parsed.data.currency })) },
  })
  return r.ok ? { ok: true, data: r.data.prices } : r
}

const signSchema = z.object({
  purpose: z.enum(["product", "logo", "banner"]),
  content_type: z.string().refine(isAcceptedImageType, "Use a JPEG, PNG or WebP image"),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Images must be 10 MB or smaller"),
})

/** Sign a direct upload; the browser then uploads the file straight to Cloudinary / the backend. */
export async function signUploadAction(input: { purpose: "product" | "logo" | "banner"; content_type: string; size: number }): Promise<ActionResult<UploadSignature>> {
  const parsed = signSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid file" }
  const r = await mutate<{ upload: UploadSignature }>("/vendor/uploads/sign", { method: "POST", body: parsed.data })
  return r.ok ? { ok: true, data: r.data.upload } : r
}
