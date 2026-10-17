import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { audit, type AnyRequest } from "../../../../../lib/http"
import { listingSnapshotSchema } from "../../../../../lib/listing-schema"
import { getMessenger } from "../../../../../lib/adapters"
import { listingView } from "../../../../../lib/vendor-listings"
import { marketplaceOf } from "../../../../../lib/vendor-onboarding"

/** Submit a draft for Haanta review. Vendors must be approved (active) first. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  if (vc.vendor_status !== "active") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Your store must be approved by Haanta before you can submit products")
  const marketplace = marketplaceOf(req)
  const listing = await marketplace.getOwnListing(vc.vendor_id, req.params.id!)
  if (!["draft", "changes_requested"].includes(listing.status)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `A ${listing.status.replace("_", " ")} product can't be submitted`)
  const parsed = listingSnapshotSchema.safeParse(listing.pending_snapshot)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Complete the product before submitting")
  if (!parsed.data.images.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add at least one photo")
  const updated = await marketplace.updateProductListings({ id: listing.id, status: "in_review", submitted_at: new Date(), review_note: null })
  await getMessenger().send({ event: "Listing Submitted For Review", audience: "staff", to: { email: process.env.HAANTA_OPS_EMAIL || "ops@haanta.com" }, properties: { listing_id: listing.id, title: listing.title, vendor_id: vc.vendor_id } })
  await audit(r, { action: "listing.submitted", entity_type: "product_listing", entity_id: listing.id, before: { status: listing.status }, after: { status: "in_review" } })
  res.json({ product: listingView(updated as unknown as Record<string, unknown>) })
}
