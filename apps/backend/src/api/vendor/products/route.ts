import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import { audit, type AnyRequest } from "../../../lib/http"
import { listingView, normaliseSnapshot, previewPrices } from "../../../lib/vendor-listings"
import { marketplaceOf } from "../../../lib/vendor-onboarding"
import type { ListingBody, VendorListQuery } from "../../validators"

export async function GET(req: AuthenticatedMedusaRequest<unknown, z.infer<typeof VendorListQuery>>, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const { limit, offset, status } = req.validatedQuery as z.infer<typeof VendorListQuery>
  const [rows, count] = await marketplaceOf(req).listAndCountProductListings(
    { vendor_id: vc.vendor_id, ...(status ? { status: status as never } : {}) },
    { take: limit, skip: offset, order: { updated_at: "DESC" } },
  )
  res.json({ products: rows.map((r) => listingView(r as unknown as Record<string, unknown>)), count, limit, offset })
}

/** Create a draft listing. Nothing goes live without Haanta approval. */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof ListingBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const snapshot = await normaliseSnapshot(req, vc.vendor_id, req.validatedBody.snapshot)
  const listing = await marketplaceOf(req).createProductListings({
    vendor_id: vc.vendor_id,
    title: snapshot.title,
    status: "draft",
    pending_snapshot: snapshot as unknown as Record<string, unknown>,
    weight_missing: snapshot.variants.some((v) => !v.weight_kg),
    size_chart_missing: !snapshot.size_chart_id,
  })
  await audit(r, { action: "listing.created", entity_type: "product_listing", entity_id: listing.id, after: snapshot })
  res.status(201).json({ product: listingView(listing as unknown as Record<string, unknown>), prices: await previewPrices(req, vc.vendor_id, null, snapshot) })
}
