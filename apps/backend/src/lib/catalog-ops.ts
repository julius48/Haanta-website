/**
 * Catalog operations shared by the review queue, the catalog migration and the seed:
 * - applyListing: turn an approved vendor listing into the live Medusa product, with server-computed
 *   prices (USD + CAD), inventory at the right stock location and Haanta attributes.
 * - repriceProducts: after a markup change, recompute retail and send changed live products back to
 *   review (the approved version stays live until a reviewer approves the new prices).
 */
import { createHash } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { IProductModuleService, MedusaContainer } from "@medusajs/framework/types"
import { batchInventoryItemLevelsWorkflow, createProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { sanitizeRichText, slugify } from "@haanta/core"
import type { VariantPrice } from "@haanta/pricing"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { computePrices } from "./pricing"
import type { ListingSnapshot } from "./listing-schema"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

export interface StoreContext {
  salesChannelId: string
  shippingProfileId: string
  locations: { lagos: string; houston: string }
}

let cachedStoreContext: StoreContext | null = null
export function resetStoreContextCache() {
  cachedStoreContext = null
}

/** IDs created by the setup/seed script (stock locations are tagged metadata.code = lagos|houston). */
export async function getStoreContext(container: MedusaContainer): Promise<StoreContext> {
  if (cachedStoreContext) return cachedStoreContext
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const [{ data: stores }, { data: locations }, { data: profiles }] = await Promise.all([
    query.graph({ entity: "store", fields: ["id", "default_sales_channel_id"] }),
    query.graph({ entity: "stock_location", fields: ["id", "name", "metadata"] }),
    query.graph({ entity: "shipping_profile", fields: ["id", "type"] }),
  ])
  const loc = (code: string) => locations.find((l) => (l.metadata as Record<string, unknown> | null)?.code === code)?.id as string | undefined
  const lagos = loc("lagos")
  const houston = loc("houston")
  const salesChannelId = stores[0]?.default_sales_channel_id as string | undefined
  const shippingProfileId = (profiles.find((p) => p.type === "default") ?? profiles[0])?.id as string | undefined
  if (!lagos || !houston || !salesChannelId || !shippingProfileId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store is not set up. Run `pnpm --filter @haanta/backend seed` first.")
  }
  cachedStoreContext = { salesChannelId, shippingProfileId, locations: { lagos, houston } }
  return cachedStoreContext
}

export function contentHash(s: ListingSnapshot): string {
  return createHash("sha256").update(JSON.stringify(s)).digest("hex")
}

/** Major-unit price objects for Medusa from integer minor units. */
function medusaPrices(p: VariantPrice) {
  return Object.entries(p.retail).map(([currency, minor]) => ({ amount: minor / 100, currency_code: currency.toLowerCase() }))
}

/**
 * Medusa 2.21 product options are standalone entities linked by id. Keep options matched by title
 * (updating their values) and create exclusive options for new titles.
 */
async function upsertProductOptions(
  container: MedusaContainer,
  existing: { id: string; title: string }[],
  wanted: { title: string; values: string[] }[],
): Promise<string[]> {
  const products = container.resolve<IProductModuleService>(Modules.PRODUCT)
  const ids: string[] = []
  for (const o of wanted) {
    const match = existing.find((e) => e.title === o.title)
    if (match) {
      await products.updateProductOptions(match.id, { values: o.values })
      ids.push(match.id)
    } else {
      const created = await products.createProductOptions({ title: o.title, values: o.values, is_exclusive: true })
      ids.push(created.id)
    }
  }
  return ids
}

export interface ApplyListingInput {
  listing_id: string
  vendor_id: string
  product_id: string | null
  snapshot: ListingSnapshot
  /** Extra product metadata (e.g. Wix migration ids). */
  metadata?: Record<string, unknown>
  handle?: string
  /** Optional Haanta merchandising (from migration or admin). */
  merch?: { shops?: string[]; merch?: string[]; styles?: string[] }
  status?: "published" | "draft"
  /** Compare-at prices (sale), USD minor per variant title. */
  compare_at?: Record<string, number>
}

export async function applyListing(container: MedusaContainer, input: ApplyListingInput): Promise<{ product_id: string; prices: VariantPrice[] }> {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const ctx = await getStoreContext(container)
  const s = input.snapshot
  const prices = await computePrices(
    container,
    s.variants.map((v) => ({
      vendor_id: input.vendor_id,
      product_id: input.product_id,
      category_ids: s.category_ids,
      vendor_price_minor: v.vendor_price_minor,
      vendor_currency: v.vendor_currency ?? "USD",
    })),
  )
  const [vendor] = await marketplace.listVendors({ id: input.vendor_id })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")

  const weightMissing = s.variants.some((v) => !v.weight_kg)
  const metadata = {
    ...(input.metadata ?? {}),
    vendor_id: vendor.id,
    vendor_slug: vendor.slug,
    vendor_name: vendor.name,
    fulfilment_type: s.fulfilment_type,
    lead_time_days: s.lead_time_days ?? null,
    is_preorder: s.is_preorder,
    material: s.material ?? null,
    care: s.care ?? null,
    styles: s.styles,
    weight_missing: weightMissing,
  }
  const variants = s.variants.map((v, i) => {
    const madeToOrder = (v.fulfilment_type ?? s.fulfilment_type) === "made_to_order"
    const manage = !madeToOrder && v.quantity != null
    const compare = input.compare_at?.[v.title]
    return {
      title: v.title,
      sku: v.sku || undefined,
      options: v.options,
      manage_inventory: manage,
      allow_backorder: false,
      // Medusa weight is unitless; Haanta stores grams. Missing weight → engine default (1.5 kg), flagged.
      weight: v.weight_kg ? Math.round(v.weight_kg * 1000) : undefined,
      metadata: {
        stock_location: v.stock_location,
        fulfilment_type: v.fulfilment_type ?? s.fulfilment_type,
        weight_missing: !v.weight_kg,
        ...(compare ? { compare_at_usd_minor: compare } : {}),
      },
      prices: medusaPrices(prices[i]!),
    }
  })

  let productId = input.product_id
  const description = sanitizeRichText(s.description)
  const images = s.images.map((url) => ({ url }))
  if (!productId) {
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: s.title,
            subtitle: s.subtitle ?? undefined,
            handle: input.handle ?? `${slugify(s.title)}-${vendor.slug}`.slice(0, 120),
            description,
            status: input.status ?? "published",
            images,
            thumbnail: s.images[0],
            options: s.options,
            category_ids: s.category_ids,
            metadata,
            sales_channels: [{ id: ctx.salesChannelId }],
            shipping_profile_id: ctx.shippingProfileId,
            variants,
          },
        ],
      },
    })
    productId = result[0]!.id
  } else {
    const { data: existing } = await query.graph({
      entity: "product",
      fields: ["id", "variants.id", "variants.title", "options.id", "options.title"],
      filters: { id: productId },
    })
    const current = (existing[0]?.variants as { id: string; title: string }[] | undefined) ?? []
    const option_ids = await upsertProductOptions(container, (existing[0]?.options as { id: string; title: string }[] | undefined) ?? [], s.options)
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: productId,
            title: s.title,
            subtitle: s.subtitle ?? undefined,
            description,
            status: input.status ?? "published",
            images,
            thumbnail: s.images[0],
            option_ids,
            category_ids: s.category_ids,
            metadata,
            variants: variants.map((v) => ({ ...v, id: current.find((c) => c.title === v.title)?.id })),
          },
        ],
      },
    })
  }

  // Inventory: one ship-from location per variant.
  const { data: rows } = await query.graph({
    entity: "product_variant",
    fields: ["id", "title", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.location_id"],
    filters: { product_id: productId },
  })
  const create: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  const update: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  const pricingRows: Record<string, unknown>[] = []
  for (const [i, v] of s.variants.entries()) {
    const row = rows.find((r) => r.title === v.title)
    if (!row) continue
    const p = prices[i]!
    pricingRows.push({
      variant_id: row.id as string,
      product_id: productId,
      vendor_id: vendor.id,
      vendor_price_minor: p.vendorPriceUsdMinor,
      retail_usd_minor: p.retail.USD!,
      retail_cad_minor: p.retail.CAD ?? p.retail.USD!,
      markup_bps: p.markup.percentBps,
      markup_fixed_minor: p.markup.fixedMinor,
      markup_source: p.markupSource,
      stock_location: v.stock_location,
      fulfilment_type: v.fulfilment_type ?? null,
      weight_kg: v.weight_kg ?? null,
    })
    const link = (row.inventory_items as { inventory_item_id: string; inventory?: { location_levels?: { location_id: string }[] } }[] | undefined)?.[0]
    if (!link || v.quantity == null) continue
    const location_id = ctx.locations[v.stock_location]
    const has = link.inventory?.location_levels?.some((l) => l.location_id === location_id)
    ;(has ? update : create).push({ inventory_item_id: link.inventory_item_id, location_id, stocked_quantity: v.quantity })
  }
  if (create.length || update.length) {
    await batchInventoryItemLevelsWorkflow(container).run({ input: { create, update, delete: [] } })
  }

  const oldPricing = await marketplace.listVariantPricings({ product_id: productId })
  if (oldPricing.length) await marketplace.deleteVariantPricings(oldPricing.map((r) => r.id))
  if (pricingRows.length) await marketplace.createVariantPricings(pricingRows as never)

  const [attrs] = await marketplace.listProductAttributes({ product_id: productId })
  const attrData = {
    product_id: productId,
    vendor_id: vendor.id,
    fulfilment_type: s.fulfilment_type,
    lead_time_days: s.lead_time_days ?? null,
    is_preorder: s.is_preorder,
    required_measurements: s.required_measurements,
    size_chart_id: s.size_chart_id ?? null,
    fit_notes: s.fit_notes ?? null,
    styles: input.merch?.styles ?? s.styles,
    shops: input.merch?.shops ?? attrs?.shops ?? [],
    merch: input.merch?.merch ?? attrs?.merch ?? [],
    weight_missing: weightMissing,
  }
  if (attrs) await marketplace.updateProductAttributes({ id: attrs.id, ...attrData })
  else await marketplace.createProductAttributes(attrData)

  return { product_id: productId, prices }
}

/**
 * Recompute retail prices for products after a markup change. Live listings whose retail would
 * change get a pending snapshot and go back to review; the live product keeps its approved prices.
 */
export async function repriceProducts(container: MedusaContainer, filter: { vendor_id?: string; product_ids?: string[] }) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const listings = await marketplace.listProductListings(
    { status: ["live", "in_review", "changes_requested"], ...(filter.vendor_id ? { vendor_id: filter.vendor_id } : {}), ...(filter.product_ids ? { product_id: filter.product_ids } : {}) },
    { take: null },
  )
  let sentToReview = 0
  for (const l of listings) {
    if (!l.product_id) continue
    const snap = (l.pending_snapshot ?? l.approved_snapshot) as ListingSnapshot | null
    if (!snap) continue
    const current = await marketplace.listVariantPricings({ product_id: l.product_id })
    const next = await computePrices(
      container,
      snap.variants.map((v) => ({ vendor_id: l.vendor_id, product_id: l.product_id, category_ids: snap.category_ids, vendor_price_minor: v.vendor_price_minor, vendor_currency: v.vendor_currency ?? "USD" })),
    )
    const signature = (pairs: string[]) => [...pairs].sort().join(",")
    const changed =
      signature(current.map((c) => `${c.retail_usd_minor}/${c.retail_cad_minor}`)) !==
      signature(next.map((p) => `${p.retail.USD}/${p.retail.CAD ?? p.retail.USD}`))
    if (changed && l.status === "live") {
      await marketplace.updateProductListings({
        id: l.id,
        status: "in_review",
        pending_snapshot: snap as unknown as Record<string, unknown>,
        review_note: "Markup changed: new retail prices need approval",
        submitted_at: new Date(),
      })
      sentToReview++
    }
  }
  return { checked: listings.length, sent_to_review: sentToReview }
}
