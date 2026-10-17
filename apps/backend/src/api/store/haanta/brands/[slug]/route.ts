import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../modules/marketplace"
import { getSearch } from "../../../../../lib/search"

/** Brand page: story, banner, size notes, policies and in-stock products. Never exposes contact details. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const [vendor] = await req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVendors({ slug: req.params.slug!, status: "active" })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Brand not found")
  const products = await getSearch(req.scope).search({ brand: vendor.slug, currency: String((req.query as Record<string, string>).currency ?? "usd"), sort: "best_selling", page: 1, limit: 48 })
  res.setHeader("Cache-Control", "public, max-age=120")
  res.json({
    brand: {
      id: vendor.id,
      name: vendor.name,
      slug: vendor.slug,
      logo_url: vendor.logo_url,
      banner_url: vendor.banner_url,
      story: vendor.story,
      region: vendor.region,
      origin_country: vendor.origin_country,
      size_notes: vendor.size_notes,
      policies: vendor.policies,
    },
    products: products.hits,
    total: products.total,
  })
}
