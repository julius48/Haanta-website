import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import { isFixtureVendor } from "../../../../lib/fixtures"

/** Public brand directory (active, non-fixture vendors only; public fields only). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendors = await req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVendors({ status: "active" }, { take: null, order: { name: "ASC" } })
  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({ brands: vendors.filter((v) => !isFixtureVendor(v.slug)).map((v) => ({ id: v.id, name: v.name, slug: v.slug, logo_url: v.logo_url, region: v.region, origin_country: v.origin_country })) })
}
