import "server-only"
import { parseFilters, type ListingFilters, type RawParams } from "@/lib/filters"
import { listBrands, searchProducts } from "./catalog"
import { getRegion } from "./region"
import { getWishlistIds } from "./customer"

export async function loadListing(sp: RawParams, opts: { category?: string; shop?: string; q?: string } = {}) {
  const parsed = parseFilters(sp)
  const filters: ListingFilters = { ...parsed, ...(opts.category !== undefined ? { category: opts.category } : {}), ...(opts.q !== undefined ? { q: opts.q } : {}) }
  const { currency } = await getRegion()
  const [result, brands, savedIds] = await Promise.all([searchProducts(filters, { currency, shop: opts.shop, limit: 24 }), listBrands(), getWishlistIds()])
  return { filters, result, currency, brands, savedIds }
}

/** Canonical URL for a listing: path + page only (filters are noindex-worthy variations). */
export function listingCanonical(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path
}
