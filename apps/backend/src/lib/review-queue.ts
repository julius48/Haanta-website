/** Review queue operations: diff, approve (publish with server prices), request changes, admin edit. */
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { AUDIT_MODULE, type AuditService } from "../modules/audit"
import { getMessenger } from "./adapters"
import { applyListing } from "./catalog-ops"
import { listingSnapshotSchema, type ListingSnapshot } from "./listing-schema"
import { computePrices } from "./pricing"

export interface FieldChange {
  path: string
  before: unknown
  after: unknown
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Field-level diff of two listing snapshots; variants are matched by title. */
export function diffSnapshots(before: ListingSnapshot | null, after: ListingSnapshot): FieldChange[] {
  const changes: FieldChange[] = []
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]) as Set<keyof ListingSnapshot>
  for (const k of keys) {
    if (k === "variants") continue
    const b = before?.[k]
    const a = after[k]
    if (!same(b, a)) changes.push({ path: k, before: b ?? null, after: a ?? null })
  }
  const bv = before?.variants ?? []
  for (const v of after.variants) {
    const old = bv.find((x) => x.title === v.title)
    if (!old) {
      changes.push({ path: `variants.${v.title}`, before: null, after: v })
      continue
    }
    for (const f of Object.keys(v) as (keyof typeof v)[]) {
      if (!same(old[f], v[f])) changes.push({ path: `variants.${v.title}.${f}`, before: old[f] ?? null, after: v[f] ?? null })
    }
  }
  for (const old of bv) if (!after.variants.some((v) => v.title === old.title)) changes.push({ path: `variants.${old.title}`, before: old, after: null })
  return changes
}

export async function reviewDetail(container: MedusaContainer, listingId: string) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [listing] = await marketplace.listProductListings({ id: listingId })
  if (!listing) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Listing not found")
  const pending = listing.pending_snapshot as ListingSnapshot | null
  const approved = listing.approved_snapshot as ListingSnapshot | null
  const [vendor] = await marketplace.listVendors({ id: listing.vendor_id })
  const current = listing.product_id ? await marketplace.listVariantPricings({ product_id: listing.product_id }) : []
  const proposed = pending
    ? await computePrices(
        container,
        pending.variants.map((v) => ({ vendor_id: listing.vendor_id, product_id: listing.product_id, category_ids: pending.category_ids, vendor_price_minor: v.vendor_price_minor, vendor_currency: v.vendor_currency ?? "USD" })),
      )
    : []
  return {
    listing,
    vendor: vendor ? { id: vendor.id, name: vendor.name, status: vendor.status } : null,
    pending,
    approved,
    changes: pending ? diffSnapshots(approved, pending) : [],
    prices: pending
      ? pending.variants.map((v, i) => ({
          variant: v.title,
          vendor_price_usd_minor: proposed[i]!.vendorPriceUsdMinor,
          retail_usd_minor: proposed[i]!.retail.USD,
          retail_cad_minor: proposed[i]!.retail.CAD,
          markup_source: proposed[i]!.markupSource,
          current_retail_usd_minor: current.find((c) => c.vendor_price_minor === proposed[i]!.vendorPriceUsdMinor)?.retail_usd_minor ?? null,
        }))
      : [],
  }
}

async function notifyVendor(container: MedusaContainer, vendorId: string, event: string, properties: Record<string, unknown>) {
  const users = await container.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVendorUsers({ vendor_id: vendorId })
  for (const u of users) await getMessenger().send({ event, audience: "vendor", to: { email: u.email }, properties })
}

/** Approve: publish the pending version with server-computed prices. */
export async function approveListing(container: MedusaContainer, listingId: string, actorId: string, note?: string) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [listing] = await marketplace.listProductListings({ id: listingId })
  if (!listing) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Listing not found")
  if (listing.status !== "in_review") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only listings in review can be approved")
  const [vendor] = await marketplace.listVendors({ id: listing.vendor_id })
  if (vendor?.status !== "active") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Approve the vendor before their products")
  const snapshot = listingSnapshotSchema.parse(listing.pending_snapshot)
  const { product_id, prices } = await applyListing(container, { listing_id: listing.id, vendor_id: listing.vendor_id, product_id: listing.product_id, snapshot })
  const updated = await marketplace.updateProductListings({
    id: listing.id,
    status: "live",
    product_id,
    approved_snapshot: snapshot as unknown as Record<string, unknown>,
    pending_snapshot: null,
    reviewed_at: new Date(),
    reviewed_by: actorId,
    review_note: note ?? null,
  })
  await container.resolve<AuditService>(AUDIT_MODULE).record({
    actor_type: "user",
    actor_id: actorId,
    action: "listing.approved",
    entity_type: "product_listing",
    entity_id: listing.id,
    before: listing.approved_snapshot,
    after: { snapshot, product_id, retail_usd_minor: prices.map((p) => p.retail.USD) },
  })
  await notifyVendor(container, listing.vendor_id, "Vendor Listing Approved", { title: listing.title, note: note ?? null })
  return updated
}

export async function requestChanges(container: MedusaContainer, listingId: string, actorId: string, note: string) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [listing] = await marketplace.listProductListings({ id: listingId })
  if (!listing) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Listing not found")
  if (listing.status !== "in_review") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only listings in review can be sent back")
  const updated = await marketplace.updateProductListings({ id: listing.id, status: "changes_requested", review_note: note, reviewed_at: new Date(), reviewed_by: actorId })
  await container.resolve<AuditService>(AUDIT_MODULE).record({ actor_type: "user", actor_id: actorId, action: "listing.changes_requested", entity_type: "product_listing", entity_id: listing.id, before: { status: listing.status }, after: { status: "changes_requested", note } })
  await notifyVendor(container, listing.vendor_id, "Vendor Listing Changes Requested", { title: listing.title, note })
  return updated
}
