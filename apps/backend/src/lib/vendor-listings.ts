import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { sanitizePlainText, sanitizeRichText } from "@haanta/core"
import type { ListingSnapshot } from "./listing-schema"
import { computePrices } from "./pricing"
import { marketplaceOf } from "./vendor-onboarding"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/**
 * Clean a vendor-submitted snapshot and check every reference belongs to the vendor or exists:
 * size chart must be the vendor's own; categories must exist.
 */
export async function normaliseSnapshot(req: MedusaRequest, vendorId: string, s: ListingSnapshot): Promise<ListingSnapshot> {
  if (s.size_chart_id) {
    await marketplaceOf(req).getOwnSizeChart(vendorId, s.size_chart_id)
  }
  if (s.category_ids.length) {
    const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({ entity: "product_category", fields: ["id"], filters: { id: s.category_ids } })
    if (data.length !== new Set(s.category_ids).size) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown category")
  }
  return {
    ...s,
    title: sanitizePlainText(s.title, 200),
    subtitle: s.subtitle ? sanitizePlainText(s.subtitle, 200) : null,
    description: sanitizeRichText(s.description),
    material: s.material ? sanitizePlainText(s.material, 200) : null,
    care: s.care ? sanitizePlainText(s.care, 1000) : null,
    fit_notes: s.fit_notes ? sanitizePlainText(s.fit_notes, 500) : null,
    styles: s.styles.map((x) => sanitizePlainText(x, 40).toLowerCase()).filter(Boolean),
    options: s.options.map((o) => ({ title: sanitizePlainText(o.title, 60), values: o.values.map((v) => sanitizePlainText(v, 80)) })),
    variants: s.variants.map((v) => ({ ...v, title: sanitizePlainText(v.title, 120) })),
  }
}

/** Storefront prices the vendor will see before submitting (server computed). */
export async function previewPrices(req: MedusaRequest, vendorId: string, productId: string | null, s: Pick<ListingSnapshot, "category_ids" | "variants">) {
  const prices = await computePrices(
    req.scope,
    s.variants.map((v) => ({ vendor_id: vendorId, product_id: productId, category_ids: s.category_ids, vendor_price_minor: v.vendor_price_minor, vendor_currency: v.vendor_currency ?? "USD" })),
  )
  return prices.map((p, i) => ({
    variant: (s.variants[i] as { title?: string }).title ?? `Variant ${i + 1}`,
    vendor_price_usd_minor: p.vendorPriceUsdMinor,
    retail: p.retail,
  }))
}

export function listingView(l: Record<string, unknown>) {
  return {
    id: l.id,
    title: l.title,
    status: l.status,
    product_id: l.product_id,
    is_live: !!l.approved_snapshot,
    has_pending_changes: !!l.pending_snapshot && !!l.approved_snapshot,
    review_note: l.review_note,
    submitted_at: l.submitted_at,
    reviewed_at: l.reviewed_at,
    weight_missing: l.weight_missing,
    size_chart_missing: l.size_chart_missing,
    updated_at: l.updated_at,
  }
}
