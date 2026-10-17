/**
 * Product search and faceting behind an interface:
 *   - LocalSearch (default): in-memory index built from the database; no keys needed.
 *   - AlgoliaSearch: used when ALGOLIA_APP_ID / ALGOLIA_ADMIN_KEY are set (REST, no SDK).
 * Facets are disjunctive: each facet's counts ignore its own filter.
 */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { htmlToText } from "@haanta/core"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

export interface SearchDocument {
  id: string
  handle: string
  title: string
  description: string
  thumbnail: string | null
  vendor: { id: string; name: string; slug: string; region: string | null }
  categories: string[]
  category_names: string[]
  styles: string[]
  shops: string[]
  merch: string[]
  sizes: string[]
  colors: string[]
  price_usd: number
  price_cad: number
  compare_at_usd: number | null
  on_sale: boolean
  ships_from: ("lagos" | "houston")[]
  fulfilment: "ready_to_wear" | "made_to_order"
  is_preorder: boolean
  in_stock: boolean
  is_new: boolean
  created_at: string
  units_sold: number
}

export interface SearchParams {
  q?: string
  category?: string
  brand?: string | string[]
  style?: string | string[]
  region?: string | string[]
  size?: string | string[]
  color?: string | string[]
  ships_from?: "lagos" | "houston"
  fulfilment?: "ready_to_wear" | "made_to_order" | "preorder"
  shop?: string
  price_min?: number
  price_max?: number
  currency: string
  on_sale?: boolean
  include_out_of_stock?: boolean
  sort: "relevance" | "newest" | "price_asc" | "price_desc" | "best_selling"
  page: number
  limit: number
}

export interface SearchResult {
  hits: SearchDocument[]
  total: number
  page: number
  pages: number
  facets: Record<string, { value: string; count: number }[]>
  price_range: { min: number; max: number }
}

export interface SearchAdapter {
  search(params: SearchParams): Promise<SearchResult>
  /** Push documents to the external index (no-op for local). */
  index(docs: SearchDocument[]): Promise<void>
}

const arr = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map((x) => x.toLowerCase())
const NEW_DAYS = 30

// ---------------------------------------------------------------- document building

let cache: { at: number; docs: SearchDocument[] } | null = null
const TTL_MS = 60_000

export function invalidateSearchCache() {
  cache = null
}

export async function buildDocuments(container: MedusaContainer): Promise<SearchDocument[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.docs
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [{ data: products }, attrs, pricing, vendors, snaps] = await Promise.all([
    query.graph({
      entity: "product",
      fields: [
        "id",
        "handle",
        "title",
        "description",
        "thumbnail",
        "created_at",
        "status",
        "metadata",
        "categories.handle",
        "categories.name",
        "categories.metadata",
        "variants.id",
        "variants.manage_inventory",
        "variants.metadata",
        "variants.options.value",
        "variants.options.option.title",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
        "variants.inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { status: "published" },
    }),
    marketplace.listProductAttributes({}, { take: null }),
    marketplace.listVariantPricings({}, { take: null }),
    marketplace.listVendors({ status: "active" }, { take: null }),
    marketplace.listLinePriceSnapshots({}, { take: null, select: ["product_id", "quantity"] }),
  ])
  const sold = new Map<string, number>()
  for (const s of snaps) if (s.product_id) sold.set(s.product_id, (sold.get(s.product_id) ?? 0) + Number(s.quantity))
  const docs: SearchDocument[] = []
  for (const p of products) {
    const a = attrs.find((x) => x.product_id === p.id)
    const vendor = vendors.find((v) => v.id === a?.vendor_id)
    if (!a || !vendor) continue
    const variants = (p.variants as Record<string, unknown>[] | undefined) ?? []
    const vp = pricing.filter((x) => x.product_id === p.id)
    if (!vp.length) continue
    const opt = (title: RegExp) =>
      [...new Set(variants.flatMap((v) => ((v.options as { value: string; option?: { title?: string } }[] | undefined) ?? []).filter((o) => title.test(o.option?.title ?? "")).map((o) => o.value)))]
    const inStock = variants.some((v) => {
      if (!v.manage_inventory) return true
      const levels = ((v.inventory_items as { inventory?: { location_levels?: { stocked_quantity: number; reserved_quantity: number }[] } }[] | undefined) ?? []).flatMap((i) => i.inventory?.location_levels ?? [])
      return levels.reduce((n, l) => n + Number(l.stocked_quantity) - Number(l.reserved_quantity), 0) > 0
    })
    const compare = variants.map((v) => Number((v.metadata as Record<string, unknown> | null)?.compare_at_usd_minor ?? 0)).filter((x) => x > 0)
    const minUsd = Math.min(...vp.map((x) => x.retail_usd_minor)) / 100
    const cats = (p.categories as { handle: string; name: string; metadata?: { path?: string } | null }[] | undefined) ?? []
    docs.push({
      id: p.id as string,
      handle: p.handle as string,
      title: p.title as string,
      description: htmlToText(p.description as string | null, 400),
      thumbnail: (p.thumbnail as string | null) ?? null,
      vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, region: vendor.region ?? null },
      categories: cats.flatMap((c) => {
        const path = c.metadata?.path ?? c.handle
        const parent = path.includes("/") ? path.split("/")[0]! : null
        return parent ? [path, parent] : [path]
      }),
      category_names: cats.map((c) => c.name),
      styles: a.styles ?? [],
      shops: a.shops ?? [],
      merch: a.merch ?? [],
      sizes: opt(/size/i),
      colors: opt(/colou?r|hue/i),
      price_usd: minUsd,
      price_cad: Math.min(...vp.map((x) => x.retail_cad_minor)) / 100,
      compare_at_usd: compare.length ? Math.min(...compare) / 100 : null,
      on_sale: compare.length > 0 && Math.min(...compare) / 100 > minUsd,
      ships_from: [...new Set(vp.map((x) => x.stock_location as "lagos" | "houston"))],
      fulfilment: a.fulfilment_type,
      is_preorder: a.is_preorder,
      in_stock: inStock,
      is_new: Date.now() - new Date(p.created_at as string).getTime() < NEW_DAYS * 86_400_000 || (a.merch ?? []).includes("new-arrival"),
      created_at: new Date(p.created_at as string).toISOString(),
      units_sold: sold.get(p.id as string) ?? 0,
    })
  }
  cache = { at: Date.now(), docs }
  return docs
}

// ---------------------------------------------------------------- local search

type Pred = (d: SearchDocument) => boolean

function predicates(p: SearchParams): Record<string, Pred> {
  const preds: Record<string, Pred> = {}
  const price = (d: SearchDocument) => (p.currency.toLowerCase() === "cad" ? d.price_cad : d.price_usd)
  if (p.q) {
    const terms = p.q.toLowerCase().split(/\s+/).filter(Boolean)
    preds.q = (d) => {
      const hay = `${d.title} ${d.vendor.name} ${d.category_names.join(" ")} ${d.styles.join(" ")} ${d.colors.join(" ")} ${d.description}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    }
  }
  if (p.category) preds.category = (d) => d.categories.includes(p.category!)
  if (p.shop) preds.shop = (d) => d.shops.includes(p.shop!) || d.merch.includes(p.shop!)
  const brands = arr(p.brand)
  if (brands.length) preds.brand = (d) => brands.includes(d.vendor.slug)
  const styles = arr(p.style)
  if (styles.length) preds.style = (d) => d.styles.some((s) => styles.includes(s.toLowerCase()))
  const regions = arr(p.region)
  if (regions.length) preds.region = (d) => !!d.vendor.region && regions.includes(d.vendor.region.toLowerCase())
  const sizes = arr(p.size)
  if (sizes.length) preds.size = (d) => d.sizes.some((s) => sizes.includes(s.toLowerCase()))
  const colors = arr(p.color)
  if (colors.length) preds.color = (d) => d.colors.some((c) => colors.includes(c.toLowerCase()))
  if (p.ships_from) preds.ships_from = (d) => d.ships_from.includes(p.ships_from!)
  if (p.fulfilment) preds.fulfilment = (d) => (p.fulfilment === "preorder" ? d.is_preorder : d.fulfilment === p.fulfilment)
  if (p.price_min !== undefined || p.price_max !== undefined) preds.price = (d) => price(d) >= (p.price_min ?? 0) && price(d) <= (p.price_max ?? Infinity)
  if (p.on_sale) preds.on_sale = (d) => d.on_sale
  if (!p.include_out_of_stock) preds.stock = (d) => d.in_stock
  return preds
}

const FACETS: Record<string, (d: SearchDocument) => string[]> = {
  category: (d) => d.categories,
  brand: (d) => [d.vendor.slug],
  style: (d) => d.styles,
  region: (d) => (d.vendor.region ? [d.vendor.region] : []),
  size: (d) => d.sizes,
  color: (d) => d.colors,
  ships_from: (d) => d.ships_from,
  fulfilment: (d) => [d.fulfilment, ...(d.is_preorder ? ["preorder"] : [])],
}

export function searchDocuments(docs: SearchDocument[], p: SearchParams): SearchResult {
  const preds = predicates(p)
  const passAll = (d: SearchDocument, except?: string) => Object.entries(preds).every(([k, f]) => k === except || f(d))
  const hits = docs.filter((d) => passAll(d))
  const facets: SearchResult["facets"] = {}
  for (const [name, get] of Object.entries(FACETS)) {
    const counts = new Map<string, number>()
    for (const d of docs) if (passAll(d, name)) for (const v of get(d)) counts.set(v, (counts.get(v) ?? 0) + 1)
    facets[name] = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  const price = (d: SearchDocument) => (p.currency.toLowerCase() === "cad" ? d.price_cad : d.price_usd)
  const sorters: Record<SearchParams["sort"], (a: SearchDocument, b: SearchDocument) => number> = {
    relevance: (a, b) => (p.q ? Number(b.title.toLowerCase().includes(p.q.toLowerCase())) - Number(a.title.toLowerCase().includes(p.q.toLowerCase())) : 0) || b.units_sold - a.units_sold || b.created_at.localeCompare(a.created_at),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    price_asc: (a, b) => price(a) - price(b),
    price_desc: (a, b) => price(b) - price(a),
    best_selling: (a, b) => b.units_sold - a.units_sold,
  }
  hits.sort(sorters[p.sort])
  const prices = docs.filter((d) => passAll(d, "price")).map(price)
  const start = (p.page - 1) * p.limit
  return {
    hits: hits.slice(start, start + p.limit),
    total: hits.length,
    page: p.page,
    pages: Math.max(1, Math.ceil(hits.length / p.limit)),
    facets,
    price_range: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
  }
}

export function createLocalSearch(container: MedusaContainer): SearchAdapter {
  return {
    async search(params) {
      return searchDocuments(await buildDocuments(container), params)
    },
    async index() {
      invalidateSearchCache()
    },
  }
}

// ---------------------------------------------------------------- Algolia

export function createAlgoliaSearch(appId: string, adminKey: string, indexName: string): SearchAdapter {
  const base = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}`
  const headers = { "X-Algolia-Application-Id": appId, "X-Algolia-API-Key": adminKey, "content-type": "application/json" }
  return {
    async search(p) {
      const filters: string[] = []
      const or = (field: string, values: string[]) => values.length && filters.push(`(${values.map((v) => `${field}:"${v.replace(/"/g, "")}"`).join(" OR ")})`)
      if (p.category) or("categories", [p.category])
      if (p.shop) or("shops", [p.shop])
      or("vendor.slug", arr(p.brand))
      or("styles", arr(p.style))
      or("sizes", arr(p.size))
      or("colors", arr(p.color))
      if (p.ships_from) or("ships_from", [p.ships_from])
      if (p.fulfilment) filters.push(p.fulfilment === "preorder" ? "is_preorder:true" : `fulfilment:"${p.fulfilment}"`)
      if (!p.include_out_of_stock) filters.push("in_stock:true")
      if (p.on_sale) filters.push("on_sale:true")
      const priceField = p.currency.toLowerCase() === "cad" ? "price_cad" : "price_usd"
      if (p.price_min !== undefined) filters.push(`${priceField} >= ${p.price_min}`)
      if (p.price_max !== undefined) filters.push(`${priceField} <= ${p.price_max}`)
      const res = await fetch(`${base}/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: p.q ?? "", filters: filters.join(" AND "), facets: ["categories", "vendor.slug", "styles", "vendor.region", "sizes", "colors", "ships_from", "fulfilment"], page: p.page - 1, hitsPerPage: p.limit }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`Algolia search failed (${res.status})`)
      const d = (await res.json()) as { hits: SearchDocument[]; nbHits: number; nbPages: number; facets?: Record<string, Record<string, number>> }
      const f = (k: string) => Object.entries(d.facets?.[k] ?? {}).map(([value, count]) => ({ value, count }))
      return {
        hits: d.hits,
        total: d.nbHits,
        page: p.page,
        pages: d.nbPages,
        facets: { category: f("categories"), brand: f("vendor.slug"), style: f("styles"), region: f("vendor.region"), size: f("sizes"), color: f("colors"), ships_from: f("ships_from"), fulfilment: f("fulfilment") },
        price_range: { min: 0, max: 0 },
      }
    },
    async index(docs) {
      const requests = docs.map((d) => ({ action: "updateObject", body: { ...d, objectID: d.id } }))
      for (let i = 0; i < requests.length; i += 500) {
        const res = await fetch(`${base}/batch`, { method: "POST", headers, body: JSON.stringify({ requests: requests.slice(i, i + 500) }), signal: AbortSignal.timeout(20000) })
        if (!res.ok) throw new Error(`Algolia indexing failed (${res.status})`)
      }
    },
  }
}

export function getSearch(container: MedusaContainer): SearchAdapter {
  const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, ALGOLIA_INDEX, TEST_TYPE } = process.env
  if (ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY && !TEST_TYPE) return createAlgoliaSearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY, ALGOLIA_INDEX || "haanta_products")
  return createLocalSearch(container)
}
