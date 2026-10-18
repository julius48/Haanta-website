import "server-only"
import { cache } from "react"
import { ApiError, medusa } from "./medusa"
import { toSearchQuery, type ListingFilters } from "@/lib/filters"
import type { BrandDetail, BrandSummary, ProductExtras, SearchResult, Settings, StoreProduct } from "@/lib/types"

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, pages: 1, facets: {}, price_range: { min: 0, max: 0 } }

export const DEFAULT_SETTINGS: Settings = {
  newsletter_popup: { enabled: false, delaySeconds: 20, frequencyDays: 14, showOnMobile: false },
  duties_message: "Prices include all import duties and taxes for US and Canada orders. No extra charges on delivery.",
  ready_to_wear_dispatch: "24-48 hrs",
  free_shipping_threshold_usd: 150,
  return_window_days: 14,
}

export const getSettings = cache(async (): Promise<Settings> => {
  try {
    return await medusa<Settings>("/store/haanta/settings", { revalidate: 300, tags: ["settings"] })
  } catch {
    return DEFAULT_SETTINGS
  }
})

/** Faceted search. Returns an empty result (with `error`) when the backend is unavailable. */
export async function searchProducts(f: ListingFilters, opts: { currency: string; shop?: string; limit?: number }): Promise<SearchResult & { error?: boolean }> {
  try {
    return await medusa<SearchResult>(`/store/haanta/search?${toSearchQuery(f, opts)}`, { revalidate: 60, tags: ["search"] })
  } catch {
    return { ...EMPTY_RESULT, error: true }
  }
}

export const listBrands = cache(async (): Promise<BrandSummary[]> => {
  try {
    const { brands } = await medusa<{ brands: BrandSummary[] }>("/store/haanta/brands", { revalidate: 300, tags: ["brands"] })
    return brands
  } catch {
    return []
  }
})

export const getBrand = cache(async (slug: string, currency: string): Promise<BrandDetail | null> => {
  if (!/^[a-z0-9-]{1,80}$/i.test(slug)) return null
  try {
    return await medusa<BrandDetail>(`/store/haanta/brands/${encodeURIComponent(slug)}?currency=${currency}`, { revalidate: 120, tags: ["brands"] })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
})

const PRODUCT_FIELDS = "*variants.calculated_price,*variants.options,*options,*images,*categories"

export const isHandle = (h: string) => /^[a-z0-9][a-z0-9-]{0,199}$/i.test(h)

export const getProduct = cache(async (handle: string, regionId: string | undefined): Promise<StoreProduct | null> => {
  if (!isHandle(handle)) return null
  const qs = new URLSearchParams({ handle, fields: PRODUCT_FIELDS, limit: "1" })
  if (regionId) qs.set("region_id", regionId)
  const { products } = await medusa<{ products: StoreProduct[] }>(`/store/products?${qs}`, { revalidate: 60, tags: ["products"] })
  return products[0] ?? null
})

export const getProductExtras = cache(async (handle: string): Promise<ProductExtras | null> => {
  if (!isHandle(handle)) return null
  try {
    return await medusa<ProductExtras>(`/store/haanta/products/${encodeURIComponent(handle)}`, { revalidate: 60, tags: ["products"] })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
})

export async function getProductsByIds(ids: string[], regionId: string | undefined): Promise<StoreProduct[]> {
  const clean = ids.filter((id) => /^prod_[A-Za-z0-9]+$/.test(id)).slice(0, 50)
  if (!clean.length) return []
  const qs = new URLSearchParams({ fields: "id,title,handle,thumbnail,*variants.calculated_price", limit: "50" })
  for (const id of clean) qs.append("id[]", id)
  if (regionId) qs.set("region_id", regionId)
  try {
    const { products } = await medusa<{ products: StoreProduct[] }>(`/store/products?${qs}`, { revalidate: 60, tags: ["products"] })
    return products
  } catch {
    return []
  }
}

/** Lowest calculated price of a Medusa product (major units) and its compare-at (original) price. */
export function productPrice(p: StoreProduct): { amount: number | null; original: number | null; currency: string } {
  let best: { amount: number; original: number | null; currency: string } | null = null
  for (const v of p.variants ?? []) {
    const cp = v.calculated_price
    if (!cp || cp.calculated_amount == null) continue
    if (!best || cp.calculated_amount < best.amount) best = { amount: cp.calculated_amount, original: cp.original_amount, currency: cp.currency_code }
  }
  if (!best) return { amount: null, original: null, currency: "usd" }
  return { amount: best.amount, original: best.original != null && best.original > best.amount ? best.original : null, currency: best.currency }
}

/** Minimal option/variant shapes for client components (keeps the RSC payload small). */
export function slimForClient(p: StoreProduct): { options: NonNullable<StoreProduct["options"]>; variants: NonNullable<StoreProduct["variants"]> } {
  return {
    options: (p.options ?? []).map((o) => ({ id: o.id, title: o.title, values: (o.values ?? []).map((v) => ({ id: v.id, value: v.value })) })),
    variants: (p.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      options: (v.options ?? []).map((o) => ({ id: o.id, value: o.value, option_id: o.option_id ?? o.option?.id ?? null })),
      calculated_price: v.calculated_price
        ? { calculated_amount: v.calculated_price.calculated_amount, original_amount: v.calculated_price.original_amount, currency_code: v.calculated_price.currency_code }
        : null,
    })),
  }
}
