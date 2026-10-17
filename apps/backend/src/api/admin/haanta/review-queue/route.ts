import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import type { ListingSnapshot } from "../../../../lib/listing-schema"
import { computePrices } from "../../../../lib/pricing"
import { diffSnapshots } from "../../../../lib/review-queue"

/** Listings waiting for review, oldest first, with vendor price, retail price and a change summary. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const listings = await marketplace.listProductListings({ status: "in_review" }, { take: 200, order: { submitted_at: "ASC" } })
  const vendors = listings.length ? await marketplace.listVendors({ id: [...new Set(listings.map((l) => l.vendor_id))] }) : []
  const rows = []
  for (const l of listings) {
    const pending = l.pending_snapshot as ListingSnapshot | null
    if (!pending) continue
    const prices = await computePrices(req.scope, pending.variants.map((v) => ({ vendor_id: l.vendor_id, product_id: l.product_id, category_ids: pending.category_ids, vendor_price_minor: v.vendor_price_minor, vendor_currency: v.vendor_currency ?? "USD" })))
    rows.push({
      id: l.id,
      title: l.title,
      vendor: vendors.find((v) => v.id === l.vendor_id)?.name ?? l.vendor_id,
      kind: l.approved_snapshot ? "change_to_live_product" : "new_product",
      submitted_at: l.submitted_at,
      vendor_price_usd_minor: Math.min(...prices.map((p) => p.vendorPriceUsdMinor)),
      retail_usd_minor: Math.min(...prices.map((p) => p.retail.USD!)),
      changed_fields: diffSnapshots(l.approved_snapshot as ListingSnapshot | null, pending).map((c) => c.path),
      weight_missing: l.weight_missing,
      size_chart_missing: l.size_chart_missing,
      review_note: l.review_note,
    })
  }
  res.json({ listings: rows, count: rows.length })
}
