/**
 * Listing filters live in the URL (shareable, crawlable, no client state). Pure helpers so they
 * are unit tested: parse search params, build backend queries and build filter links.
 */
import type { SortKey } from "./types"

export const MULTI_KEYS = ["brand", "style", "region", "size", "color"] as const
export type MultiKey = (typeof MULTI_KEYS)[number]

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "best_selling", label: "Best sellers" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
]

export const SHIPS_FROM_LABEL: Record<"lagos" | "houston", string> = {
  houston: "Ships from the US (Houston)",
  lagos: "Ships from Nigeria",
}

export const FULFILMENT_LABEL: Record<"ready_to_wear" | "made_to_order" | "preorder", string> = {
  ready_to_wear: "Ready to wear",
  made_to_order: "Made to order",
  preorder: "Pre-order",
}

export interface ListingFilters {
  q?: string
  category?: string
  brand: string[]
  style: string[]
  region: string[]
  size: string[]
  color: string[]
  ships_from?: "lagos" | "houston"
  fulfilment?: "ready_to_wear" | "made_to_order" | "preorder"
  price_min?: number
  price_max?: number
  on_sale?: boolean
  sort: SortKey
  page: number
}

export type RawParams = Record<string, string | string[] | undefined>

const clean = (s: string, max: number) => s.trim().slice(0, max)

function list(v: string | string[] | undefined, max: number): string[] {
  const arr = v === undefined ? [] : Array.isArray(v) ? v : [v]
  return [...new Set(arr.map((x) => clean(x, 80)).filter(Boolean))].slice(0, max)
}

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  if (s === undefined) return undefined
  const t = s.trim()
  return t === "" ? undefined : t
}

function num(v: string | string[] | undefined): number | undefined {
  const s = one(v)
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.floor(n) : undefined
}

const SORT_VALUES = new Set<string>(SORTS.map((s) => s.value))

export function parseFilters(sp: RawParams): ListingFilters {
  const ships = one(sp.ships_from)
  const ful = one(sp.fulfilment)
  const sort = one(sp.sort)
  const page = num(sp.page)
  const q = one(sp.q)
  const category = one(sp.category)
  return {
    q: q ? clean(q, 100) : undefined,
    category: category && /^[a-z0-9/_-]{1,80}$/i.test(category) ? category.toLowerCase() : undefined,
    brand: list(sp.brand, 20),
    style: list(sp.style, 20),
    region: list(sp.region, 20),
    size: list(sp.size, 30),
    color: list(sp.color, 30),
    ships_from: ships === "lagos" || ships === "houston" ? ships : undefined,
    fulfilment: ful === "ready_to_wear" || ful === "made_to_order" || ful === "preorder" ? ful : undefined,
    price_min: num(sp.price_min),
    price_max: num(sp.price_max),
    on_sale: one(sp.on_sale) === "1" || one(sp.on_sale) === "true" ? true : undefined,
    sort: sort && SORT_VALUES.has(sort) ? (sort as SortKey) : "relevance",
    page: page && page >= 1 && page <= 500 ? page : 1,
  }
}

/** Query string for GET /store/haanta/search. `on_sale` is only sent when true (the backend coerces "false" to true). */
export function toSearchQuery(f: ListingFilters, opts: { currency: string; shop?: string; limit?: number }): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.category) p.set("category", f.category)
  for (const k of MULTI_KEYS) for (const v of f[k]) p.append(k, v)
  if (f.ships_from) p.set("ships_from", f.ships_from)
  if (f.fulfilment) p.set("fulfilment", f.fulfilment)
  if (opts.shop) p.set("shop", opts.shop)
  if (f.price_min !== undefined) p.set("price_min", String(f.price_min))
  if (f.price_max !== undefined) p.set("price_max", String(f.price_max))
  if (f.on_sale) p.set("on_sale", "true")
  p.set("currency", opts.currency.toLowerCase() === "cad" ? "cad" : "usd")
  p.set("sort", f.sort)
  p.set("page", String(f.page))
  p.set("limit", String(opts.limit ?? 24))
  return p.toString()
}

/** URL params for a storefront listing page (defaults omitted). `includeCategory` is false when the category is in the path. */
export function toPageParams(f: ListingFilters, includeCategory: boolean): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (includeCategory && f.category) p.set("category", f.category)
  for (const k of MULTI_KEYS) for (const v of f[k]) p.append(k, v)
  if (f.ships_from) p.set("ships_from", f.ships_from)
  if (f.fulfilment) p.set("fulfilment", f.fulfilment)
  if (f.price_min !== undefined) p.set("price_min", String(f.price_min))
  if (f.price_max !== undefined) p.set("price_max", String(f.price_max))
  if (f.on_sale) p.set("on_sale", "1")
  if (f.sort !== "relevance") p.set("sort", f.sort)
  if (f.page > 1) p.set("page", String(f.page))
  return p
}

export interface ListingContext {
  /** e.g. "/shop", "/search", "/shops/vacay-bae". */
  basePath: string
  /** "path": category lives in the URL path (/shop/women/dresses). "param": ?category=. */
  categoryMode: "path" | "param"
}

export type FilterChange =
  | { toggle: MultiKey; value: string }
  | { set: Partial<Omit<ListingFilters, MultiKey>> }
  | { clear: true }

/** Build the href for a filter change. Any change except paging resets to page 1. */
export function buildFilterHref(ctx: ListingContext, f: ListingFilters, change: FilterChange): string {
  let next: ListingFilters = { ...f, brand: [...f.brand], style: [...f.style], region: [...f.region], size: [...f.size], color: [...f.color] }
  if ("clear" in change) {
    next = { brand: [], style: [], region: [], size: [], color: [], sort: f.sort, page: 1, q: f.q, category: ctx.categoryMode === "path" ? f.category : undefined }
  } else if ("toggle" in change) {
    const cur = next[change.toggle]
    next[change.toggle] = cur.includes(change.value) ? cur.filter((x) => x !== change.value) : [...cur, change.value]
    next.page = 1
  } else {
    next = { ...next, ...change.set }
    if (!("page" in change.set)) next.page = 1
  }
  let path = ctx.basePath
  if (ctx.categoryMode === "path") path = next.category ? `/shop/${next.category}` : "/shop"
  const qs = toPageParams(next, ctx.categoryMode === "param").toString()
  return qs ? `${path}?${qs}` : path
}

export function hasActiveFilters(f: ListingFilters): boolean {
  return (
    MULTI_KEYS.some((k) => f[k].length > 0) ||
    !!f.ships_from ||
    !!f.fulfilment ||
    f.price_min !== undefined ||
    f.price_max !== undefined ||
    !!f.on_sale
  )
}
