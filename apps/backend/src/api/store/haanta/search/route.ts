import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSearch, type SearchParams } from "../../../../lib/search"

/** Listing and search with facets. Out-of-stock products are excluded. Rate limited. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const p = req.validatedQuery as unknown as SearchParams
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120")
  res.json(await getSearch(req.scope).search({ ...p, currency: (p.currency ?? "usd").toLowerCase(), include_out_of_stock: false }))
}
