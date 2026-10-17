import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../../modules/marketplace"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import type { ListingSnapshot } from "../../../../../../lib/listing-schema"
import { normaliseSnapshot } from "../../../../../../lib/vendor-listings"

/** Reviewer edits the pending version (e.g. fixes a typo or category) before approving. */
export async function POST(req: AuthenticatedMedusaRequest<{ snapshot: ListingSnapshot; note?: string }>, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [listing] = await marketplace.listProductListings({ id: req.params.id! })
  if (!listing) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Listing not found")
  if (listing.status !== "in_review") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only listings in review can be edited")
  const snapshot = await normaliseSnapshot(req, listing.vendor_id, req.validatedBody.snapshot)
  const updated = await marketplace.updateProductListings({ id: listing.id, title: snapshot.title, pending_snapshot: snapshot as never, review_note: req.validatedBody.note ?? listing.review_note })
  await audit(req as unknown as AnyRequest, { action: "listing.edited_by_reviewer", entity_type: "product_listing", entity_id: listing.id, before: listing.pending_snapshot, after: snapshot })
  res.json({ listing: { id: updated.id, status: updated.status } })
}
