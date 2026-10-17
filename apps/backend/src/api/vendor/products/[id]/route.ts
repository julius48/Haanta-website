import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import { audit, type AnyRequest } from "../../../../lib/http"
import type { ListingSnapshot } from "../../../../lib/listing-schema"
import { listingView, normaliseSnapshot, previewPrices } from "../../../../lib/vendor-listings"
import { marketplaceOf } from "../../../../lib/vendor-onboarding"
import type { ListingBody } from "../../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const listing = await marketplaceOf(req).getOwnListing(vc.vendor_id, req.params.id!)
  const snapshot = (listing.pending_snapshot ?? listing.approved_snapshot) as ListingSnapshot | null
  res.json({
    product: listingView(listing as unknown as Record<string, unknown>),
    snapshot,
    approved_snapshot: listing.approved_snapshot,
    prices: snapshot ? await previewPrices(req, vc.vendor_id, listing.product_id, snapshot) : [],
  })
}

/**
 * Edit a listing. Drafts and listings with requested changes are edited in place. A change to a
 * live listing is saved as pending and goes straight back to review; the approved version stays live.
 */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof ListingBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const listing = await marketplace.getOwnListing(vc.vendor_id, req.params.id!)
  const snapshot = await normaliseSnapshot(req, vc.vendor_id, req.validatedBody.snapshot)
  const wasLive = listing.status === "live" || (listing.status === "in_review" && !!listing.approved_snapshot)
  const updated = await marketplace.updateProductListings({
    id: listing.id,
    title: snapshot.title,
    pending_snapshot: snapshot as unknown as Record<string, unknown>,
    weight_missing: snapshot.variants.some((v) => !v.weight_kg),
    size_chart_missing: !snapshot.size_chart_id,
    ...(wasLive ? { status: "in_review" as const, submitted_at: new Date(), review_note: null } : {}),
  })
  await audit(r, { action: wasLive ? "listing.live_change_submitted" : "listing.updated", entity_type: "product_listing", entity_id: listing.id, before: listing.pending_snapshot ?? listing.approved_snapshot, after: snapshot })
  res.json({ product: listingView(updated as unknown as Record<string, unknown>), prices: await previewPrices(req, vc.vendor_id, listing.product_id, snapshot) })
}

/** Only drafts that were never approved can be deleted. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const listing = await marketplace.getOwnListing(vc.vendor_id, req.params.id!)
  if (listing.approved_snapshot || listing.product_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Live products can't be deleted. Contact Haanta to unpublish.")
  await marketplace.softDeleteProductListings([listing.id])
  await audit(r, { action: "listing.deleted", entity_type: "product_listing", entity_id: listing.id, before: listing.pending_snapshot })
  res.json({ id: listing.id, deleted: true })
}
