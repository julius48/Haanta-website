import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../modules/marketplace"
import { REVIEWS_MODULE, type ReviewsService } from "../../../../../modules/reviews"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../../../modules/haanta-settings"
import { MEASUREMENT_FIELDS } from "../../../../middlewares/cart"
import { buildDocuments } from "../../../../../lib/search"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/**
 * Product detail extras for the storefront: Haanta attributes, per-brand size chart (US/UK), fit
 * notes, made-to-order measurement fields, ships-from, delivery estimate, badges, reviews summary
 * and "complete the look". Variants and prices come from Medusa's own store product API.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const { data } = await query.graph({ entity: "product", fields: ["id", "handle", "title", "status", "created_at", "metadata"], filters: { handle: req.params.handle!, status: "published" } })
  const product = data[0]
  if (!product) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const [attrs] = await marketplace.listProductAttributes({ product_id: product.id as string })
  if (!attrs) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const [vendor] = await marketplace.listVendors({ id: attrs.vendor_id, status: "active" })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const [chart] = attrs.size_chart_id ? await marketplace.listSizeCharts({ id: attrs.size_chart_id, vendor_id: vendor.id }) : []
  const pricing = await marketplace.listVariantPricings({ product_id: product.id as string })
  const settings = await req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")
  const reviews = await req.scope.resolve<ReviewsService>(REVIEWS_MODULE).listProductReviews({ product_id: product.id as string, status: "approved" }, { take: 50, order: { created_at: "DESC" } })
  const shipsFrom = [...new Set(pricing.map((p) => p.stock_location))]
  const docs = await buildDocuments(req.scope)
  const doc = docs.find((d) => d.id === product.id)
  const completeTheLook = docs
    .filter((d) => d.id !== product.id && d.in_stock && (d.vendor.id === vendor.id || d.shops.some((s) => attrs.shops?.includes(s))))
    .sort((a, b) => Number(b.vendor.id === vendor.id) - Number(a.vendor.id === vendor.id) || b.units_sold - a.units_sold)
    .slice(0, 8)

  const badges: string[] = []
  if (doc?.is_new) badges.push("new")
  if (attrs.is_preorder) badges.push("preorder")
  if (attrs.fulfilment_type === "made_to_order") badges.push("made_to_order")
  if (doc?.on_sale) badges.push("sale")

  const dispatch =
    attrs.fulfilment_type === "made_to_order"
      ? `Made to order: ships in about ${attrs.lead_time_days ?? 14} days`
      : `Ready to wear: ships within ${settings.readyToWearDispatchHours}`
  const transit = shipsFrom.includes("houston") && !shipsFrom.includes("lagos") ? "then 2-5 working days from our Houston hub" : "then 10-21 days standard or 2-3 days express from Nigeria"
  const ratings = reviews.map((r) => Number(r.rating))
  res.setHeader("Cache-Control", "public, max-age=60")
  res.json({
    product_id: product.id,
    vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, region: vendor.region, size_notes: vendor.size_notes, logo_url: vendor.logo_url },
    fulfilment_type: attrs.fulfilment_type,
    lead_time_days: attrs.lead_time_days,
    is_preorder: attrs.is_preorder,
    fit_notes: attrs.fit_notes,
    required_measurements: (attrs.required_measurements ?? []).map((k) => ({ key: k, ...MEASUREMENT_FIELDS[k as keyof typeof MEASUREMENT_FIELDS], unit: "in" })),
    size_chart: chart ? { name: chart.name, unit: chart.unit, rows: chart.rows, notes: chart.notes } : null,
    ships_from: shipsFrom,
    variants: pricing.map((p) => ({ variant_id: p.variant_id, ships_from: p.stock_location, fulfilment_type: p.fulfilment_type ?? attrs.fulfilment_type })),
    delivery_estimate: `${dispatch}, ${transit}.${attrs.is_preorder ? " Pre-order: delivery dates are after production." : ""}`,
    badges,
    material: (product.metadata as Record<string, unknown> | null)?.material ?? null,
    care: (product.metadata as Record<string, unknown> | null)?.care ?? null,
    reviews: {
      average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      count: ratings.length,
      fit: { runs_small: reviews.filter((r) => r.fit === "runs_small").length, true_to_size: reviews.filter((r) => r.fit === "true_to_size").length, runs_large: reviews.filter((r) => r.fit === "runs_large").length },
      items: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, fit: r.fit, photos: r.photos, display_name: r.display_name, verified_purchase: r.verified_purchase, created_at: r.created_at })),
    },
    complete_the_look: completeTheLook,
  })
}
