/**
 * Pure mapping rules for the Wix catalog export (docs/catalog-export.csv) into the Haanta model.
 * Used by the migration script in apps/backend; every rule is unit tested.
 */

export function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
}

/** URL slug: lowercase ASCII, hyphen separated. */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ---------------------------------------------------------------- brands

export interface BrandDef {
  name: string
  slug: string
  aliases: string[]
}

/** Canonical brands with every spelling seen in the export (brand field, collections, ribbons). */
export const BRANDS: BrandDef[] = [
  { name: "Trax Apparel", aliases: [] },
  { name: "Kola Kuddus", aliases: [] },
  { name: "Soso Lagos", aliases: [] },
  { name: "Simona", aliases: ["Siimona"] },
  { name: "Oyiza", aliases: [] },
  { name: "Fiibii Studio", aliases: ["Fibii Studio", "Fiibii  Studio"] },
  { name: "Tisora", aliases: [] },
  { name: "Temade Studios", aliases: ["Temade"] },
  { name: "FEJ", aliases: [] },
  { name: "Melira", aliases: ["Meliria"] },
  { name: "Shop Mora", aliases: ["Mora"] },
  { name: "Amarelis", aliases: [] },
  { name: "Lola Signatures", aliases: ["Lola's signature", "Lola's Signature", "Lola Signature"] },
  { name: "ÀÁDÙN", aliases: ["Aadun", "Aadun & Co", "Aadun and Co"] },
  { name: "Liz & Co", aliases: [] },
  { name: "Gozi Fego", aliases: [] },
  { name: "Bamigugu", aliases: [] },
  { name: "Se Adeoye", aliases: [] },
  { name: "Tan and Sunset", aliases: ["Tan & Sunset"] },
  { name: "Maple Street", aliases: [] },
  { name: "Tadah", aliases: [] },
  { name: "Goldstitche Handmade", aliases: [] },
  { name: "Folm", aliases: [] },
  { name: "Doye", aliases: ["Doye Brand"] },
  { name: "Avril by WK", aliases: ["AvrilbyWK", "AvrilbyWk", "Avrilby"] },
  { name: "Atuche Woman", aliases: ["Atuche"] },
  { name: "Ulaku Finds", aliases: [] },
  { name: "Roar Ng", aliases: [] },
  { name: "SHEISBUJINE", aliases: [] },
  { name: "Dear Ketandu", aliases: [] },
].map((b) => ({ ...b, slug: slugify(b.name) }))

const BRAND_INDEX = new Map<string, BrandDef>()
for (const b of BRANDS) {
  BRAND_INDEX.set(normKey(b.name), b)
  for (const a of b.aliases) BRAND_INDEX.set(normKey(a), b)
}

export function canonicalBrand(raw: string | null | undefined): BrandDef | null {
  if (!raw?.trim()) return null
  return BRAND_INDEX.get(normKey(raw)) ?? null
}

// ---------------------------------------------------------------- collections

export type StockLocationCode = "lagos" | "houston"

export const PROMOTION_COLLECTIONS: Record<string, string> = {
  blackfridaysale: "black-friday",
  "15sales": "fifteen-percent-off",
  freeshipping: "free-shipping",
  sales: "sale",
}

/** Curated shops live in Sanity; collections map to shop slugs. */
export const SHOP_COLLECTIONS: Record<string, string> = {
  specialoccasions: "special-occasions",
  vacaybae: "vacay-bae",
  boldprints: "bold-prints",
  casualchics: "casual-chic",
  casualchic: "casual-chic",
  corporategirlies: "work-from-office",
  businessandformalwear: "work-from-office",
  modernclassic: "elevated-essentials",
}

export const STYLE_COLLECTIONS: Record<string, string> = {
  casuals: "casual",
  party: "party",
  eveningwear: "evening",
  businessandformalwear: "formal",
  corporategirlies: "workwear",
  modernclassic: "modern-classic",
  sustainablefashion: "sustainable",
  summer: "summer",
  asooke: "aso-oke",
  beachwears: "beachwear",
  boldprints: "bold-prints",
}

export const MERCH_COLLECTIONS: Record<string, string> = {
  discover: "discover",
  newarrivals: "new-arrival",
  bestseller: "best-seller",
  haantapicks: "haanta-picks",
  stylistspicks: "stylist-picks",
  shopbyoccassion: "occasion",
  heavyitems: "heavy",
}

const ORIGIN_COLLECTIONS: Record<string, StockLocationCode> = {
  shippedfromus: "houston",
  haantahoustonstock: "houston",
  shipsfromnorthamerica: "houston",
  shippedfromnigeria: "lagos",
}

/** Collections that were bulk-applied in Wix and are not reliable category signals. */
const WEAK_CATEGORY_COLLECTIONS = new Set(["artwork", "bottoms", "accessories", "home", "homeandart"])

export interface CollectionClassification {
  brand: BrandDef | null
  origin: StockLocationCode | null
  promotions: string[]
  shops: string[]
  styles: string[]
  merch: string[]
  gender: "women" | "men" | "kids" | null
  strongCategoryHints: string[]
  weakCategoryHints: string[]
  unknown: string[]
}

export function splitCollections(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function classifyCollections(collections: string[]): CollectionClassification {
  const c: CollectionClassification = {
    brand: null,
    origin: null,
    promotions: [],
    shops: [],
    styles: [],
    merch: [],
    gender: null,
    strongCategoryHints: [],
    weakCategoryHints: [],
    unknown: [],
  }
  const genders = new Set<string>()
  for (const name of collections) {
    const k = normKey(name)
    let used = false
    const brand = BRAND_INDEX.get(k)
    if (brand) {
      c.brand ??= brand
      used = true
    }
    if (ORIGIN_COLLECTIONS[k]) {
      // Houston wins: the product is (also) stocked in the US hub.
      if (c.origin !== "houston") c.origin = ORIGIN_COLLECTIONS[k]!
      used = true
    }
    const add = (map: Record<string, string>, into: string[]) => {
      const v = map[k]
      if (v) {
        if (!into.includes(v)) into.push(v)
        used = true
      }
    }
    add(PROMOTION_COLLECTIONS, c.promotions)
    add(SHOP_COLLECTIONS, c.shops)
    add(STYLE_COLLECTIONS, c.styles)
    add(MERCH_COLLECTIONS, c.merch)
    if (k === "women" || k === "men" || k === "kids") {
      genders.add(k)
      used = true
    }
    if (CATEGORY_COLLECTIONS[k]) {
      ;(WEAK_CATEGORY_COLLECTIONS.has(k) ? c.weakCategoryHints : c.strongCategoryHints).push(k)
      used = true
    }
    if (!used) c.unknown.push(name)
  }
  if (genders.has("kids")) c.gender = "kids"
  else if (genders.has("men") && !genders.has("women")) c.gender = "men"
  else if (genders.has("women") && !genders.has("men")) c.gender = "women"
  else if (genders.has("men") && genders.has("women")) c.gender = null
  return c
}

// ---------------------------------------------------------------- categories

export interface CategoryDef {
  handle: string
  name: string
  parent: string | null
}

/** The category tree. Handles are paths so they are stable and readable. */
export const CATEGORY_TREE: CategoryDef[] = [
  { handle: "women", name: "Women", parent: null },
  { handle: "women/dresses", name: "Dresses", parent: "women" },
  { handle: "women/tops", name: "Tops", parent: "women" },
  { handle: "women/bottoms", name: "Bottoms", parent: "women" },
  { handle: "women/sets", name: "Sets", parent: "women" },
  { handle: "women/jumpsuits", name: "Jumpsuits", parent: "women" },
  { handle: "women/jackets", name: "Jackets & Suits", parent: "women" },
  { handle: "women/beachwear", name: "Beachwear", parent: "women" },
  { handle: "men", name: "Men", parent: null },
  { handle: "men/tops", name: "Tops", parent: "men" },
  { handle: "men/bottoms", name: "Bottoms", parent: "men" },
  { handle: "men/sets", name: "Sets", parent: "men" },
  { handle: "men/jackets", name: "Jackets & Suits", parent: "men" },
  { handle: "men/kaftans", name: "Kaftans & Agbada", parent: "men" },
  { handle: "kids", name: "Kids", parent: null },
  { handle: "accessories", name: "Accessories", parent: null },
  { handle: "accessories/jewellery", name: "Jewellery", parent: "accessories" },
  { handle: "accessories/bags", name: "Bags", parent: "accessories" },
  { handle: "accessories/shoes", name: "Shoes", parent: "accessories" },
  { handle: "accessories/headwear", name: "Caps & Headwear", parent: "accessories" },
  { handle: "beauty", name: "Beauty", parent: null },
  { handle: "beauty/hair", name: "Hair", parent: "beauty" },
  { handle: "beauty/skincare", name: "Skincare", parent: "beauty" },
  { handle: "beauty/fragrance", name: "Perfume Oils", parent: "beauty" },
  { handle: "home", name: "Home & Art", parent: null },
  { handle: "home/furniture", name: "Furniture", parent: "home" },
  { handle: "home/art", name: "Art & Decor", parent: "home" },
]

type Gendered = "tops" | "bottoms" | "sets" | "jackets"

/** Collection → category rule. `g:` rules are resolved against the product's gender. */
const CATEGORY_COLLECTIONS: Record<string, string> = {
  dresses: "women/dresses",
  womenstops: "women/tops",
  maletopstshirts: "men/tops",
  menbottoms: "men/bottoms",
  tops: "g:tops",
  bottoms: "g:bottoms",
  twopiecesets: "g:sets",
  threepiecesets: "g:sets",
  suitsjacket: "g:jackets",
  beachwears: "women/beachwear",
  eveningwear: "women/dresses",
  womenbags: "accessories/bags",
  earrings: "accessories/jewellery",
  accessories: "accessories",
  beautyandhair: "beauty/hair",
  skincare: "beauty/skincare",
  perfumeoils: "beauty/fragrance",
  home: "home",
  homeandart: "home",
  artwork: "home/art",
}

/** Name keyword rules, checked in order. Specific before generic. */
const NAME_RULES: [RegExp, string][] = [
  [/\b(stool|chair|table|bench|furniture)\b/i, "home/furniture"],
  [/\b(painting|canvas|wall art|artwork|sculpture|rug|mat|basket|vase|cushion)\b/i, "home/art"],
  [/\b(perfume|fragrance|oil|scent)\b/i, "beauty/fragrance"],
  [/\b(soap|cream|serum|butter|lotion|scrub|balm|skincare)\b/i, "beauty/skincare"],
  [/\b(wig|hair|bonnet|braid)\b/i, "beauty/hair"],
  [/\b(set|co-?ord|two[- ]piece|three[- ]piece|outfit|look)\b/i, "g:sets"],
  [/\b(earrings?|necklace|bracelet|bangle|ring|anklet|jewel(le)?ry|beads?)\b/i, "accessories/jewellery"],
  [/\b(bag|clutch|purse|tote|backpack)\b/i, "accessories/bags"],
  [/\b(sandals?|shoes?|slides?|slippers?|heels?|mules?|sneakers?|loafers?)\b/i, "accessories/shoes"],
  [/\b(caps?|hats?|fila|berets?|headwraps?|gele|turbans?)\b/i, "accessories/headwear"],
  [/\bjumpsuit|playsuit|romper\b/i, "women/jumpsuits"],
  [/\b(agbada|kaftan|caftan|danshiki|dashiki|jalabiya|senator)\b/i, "g:kaftans"],
  [/\b(dress|gown|boubou|bubu|abaya)\b/i, "women/dresses"],
  [/\b(jacket|blazer|suit|coat|waistcoat|kimono)\b/i, "g:jackets"],
  [/\b(skirt)\b/i, "women/bottoms"],
  [/\b(pants?|trousers?|shorts?|jorts|culottes|joggers?|jeans)\b/i, "g:bottoms"],
  [/\b(top|shirt|t-shirt|tee|blouse|corset|bodysuit|crop|polo|tunic|camisole|cami)\b/i, "g:tops"],
]

function resolveGendered(rule: string, gender: CollectionClassification["gender"], name: string): string {
  if (!rule.startsWith("g:")) return rule
  const kind = rule.slice(2) as Gendered | "kaftans"
  if (gender === "kids") return "kids"
  const menByName = /\b(men'?s|male|agbada|danshiki|dashiki|senator|jalabiya)\b/i.test(name)
  const g = gender ?? (menByName ? "men" : "women")
  if (kind === "kaftans") return g === "men" ? "men/kaftans" : "women/dresses"
  return `${g}/${kind}`
}

/**
 * Best category for a product: name keywords first (the most reliable signal in this export), then
 * strong collections, then weak (bulk-applied) collections. Returns null when nothing matches.
 */
export function inferCategory(name: string, c: CollectionClassification): { handle: string; source: "name" | "collection" | "weak_collection" } | null {
  if (c.gender === "kids") return { handle: "kids", source: c.strongCategoryHints.length ? "collection" : "name" }
  for (const [re, rule] of NAME_RULES) {
    if (re.test(name)) return { handle: resolveGendered(rule, c.gender, name), source: "name" }
  }
  for (const k of c.strongCategoryHints) {
    return { handle: resolveGendered(CATEGORY_COLLECTIONS[k]!, c.gender, name), source: "collection" }
  }
  if (c.gender) return { handle: c.gender, source: "collection" }
  for (const k of c.weakCategoryHints) {
    return { handle: resolveGendered(CATEGORY_COLLECTIONS[k]!, c.gender, name), source: "weak_collection" }
  }
  return null
}

// ---------------------------------------------------------------- options

export type OptionKind = "size" | "color" | "piece" | "fulfilment" | "fit_length" | "length" | "age" | "volume" | "dimension" | "other"

const OPTION_KINDS: Record<string, { kind: OptionKind; title: string }> = {
  size: { kind: "size", title: "Size" },
  sizes: { kind: "size", title: "Size" },
  sizeus: { kind: "size", title: "Size" },
  sizeuk: { kind: "size", title: "Size" },
  sizenumber: { kind: "size", title: "Size" },
  danshikisize: { kind: "size", title: "Size" },
  pantsize: { kind: "size", title: "Pant size" },
  color: { kind: "color", title: "Colour" },
  colour: { kind: "color", title: "Colour" },
  colours: { kind: "color", title: "Colour" },
  hue: { kind: "color", title: "Colour" },
  shirtcolor: { kind: "color", title: "Shirt colour" },
  topcolor: { kind: "color", title: "Top colour" },
  apparel: { kind: "piece", title: "Piece" },
  twopieceoutfit: { kind: "piece", title: "Piece" },
  ordertype: { kind: "fulfilment", title: "Order type" },
  height: { kind: "fit_length", title: "Fit" },
  length: { kind: "length", title: "Length" },
  heightlength: { kind: "length", title: "Length" },
  age: { kind: "age", title: "Age" },
  volume: { kind: "volume", title: "Volume" },
  dimension: { kind: "dimension", title: "Dimension" },
  lengthcm: { kind: "dimension", title: "Length (cm)" },
  widthcm: { kind: "dimension", title: "Width (cm)" },
}

export interface NormalisedOptionValue {
  /** Value stored on the variant (stable, without colour hex). */
  value: string
  /** Text label shown to buyers (colours always have a text label). */
  label: string
  swatch?: string
  size?: ParsedSize
}

export interface NormalisedOption {
  sourceName: string
  kind: OptionKind
  title: string
  values: NormalisedOptionValue[]
}

const HEX_PREFIX = /^#[0-9a-f]{6}:/i

/** Clean a single option value: strips the Wix "#RRGGBB:" colour prefix that leaked into size fields. */
export function cleanOptionValue(raw: string): { value: string; swatch?: string } {
  const v = raw.trim()
  if (HEX_PREFIX.test(v)) return { value: v.slice(8).trim(), swatch: v.slice(0, 7).toLowerCase() }
  return { value: v }
}

export function normaliseOption(name: string, type: string, description: string): NormalisedOption {
  const def = OPTION_KINDS[normKey(name)] ?? { kind: "other" as const, title: name.trim() }
  const values = description
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const { value, swatch } = cleanOptionValue(raw)
      const out: NormalisedOptionValue = { value, label: value }
      if (def.kind === "color" && swatch) out.swatch = swatch
      if (def.kind === "size") out.size = parseSize(value, normKey(name))
      return out
    })
  return { sourceName: name.trim(), kind: def.kind, title: def.title, values }
}

export interface ParsedSize {
  label: string
  alpha?: string
  us?: string
  uk?: string
  custom: boolean
}

/** Parse "M / UK 12 / US 8", "US 6", "UK 10-12", "S", "Custom Sizing", "8" (with option name context). */
export function parseSize(raw: string, optionKey = "size"): ParsedSize {
  const label = cleanOptionValue(raw).value
  const out: ParsedSize = { label, custom: /^custom/i.test(label) }
  for (const part of label.split("/").map((p) => p.trim())) {
    const us = /^US\s*([\d.-]+)$/i.exec(part)
    const uk = /^UK\s*([\d.-]+)$/i.exec(part)
    if (us) out.us = us[1]
    else if (uk) out.uk = uk[1]
    else if (/^(\d?X{0,3}[SL]|M|XXS|XXL|\dXL|\dXS|free size|one size)$/i.test(part)) out.alpha = part.toUpperCase()
    else if (/^\d+(\.\d+)?$/.test(part)) {
      if (optionKey === "sizeuk") out.uk = part
      else if (optionKey === "sizeus" || optionKey === "size") out.us = part
    }
  }
  return out
}

/** Variants whose size is "Custom"/"Custom Sizing", or whose order type is "made to order". */
export function isMadeToOrderValue(kind: OptionKind, value: string): boolean {
  if (kind === "size") return /^custom/i.test(value)
  if (kind === "fulfilment") return /made\s*to\s*order/i.test(value)
  return false
}

// ---------------------------------------------------------------- misc fields

export function wixMediaUrl(mediaId: string): string | null {
  const id = mediaId.trim()
  if (!id) return null
  if (/^https:\/\/static\.wixstatic\.com\/media\//.test(id)) return id
  if (!/^[\w~.-]+$/.test(id)) return null
  return `https://static.wixstatic.com/media/${id}`
}

export function parseImages(raw: string | null | undefined): string[] {
  return splitCollections(raw)
    .map(wixMediaUrl)
    .filter((u): u is string => !!u)
}

export type ParsedInventory = { manage: false } | { manage: true; quantity: number }

/** Wix inventory: "InStock" (untracked, always available), "OutOfStock", or a number. */
export function parseWixInventory(raw: string | null | undefined): ParsedInventory {
  const v = (raw ?? "").trim()
  if (/^instock$/i.test(v) || v === "") return { manage: false }
  if (/^outofstock$/i.test(v)) return { manage: true, quantity: 0 }
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? { manage: true, quantity: Math.floor(n) } : { manage: true, quantity: 0 }
}

export function parseWeightKg(raw: string | null | undefined): number | null {
  const n = Number((raw ?? "").trim())
  return raw?.trim() && Number.isFinite(n) && n > 0 ? n : null
}

export function parseMoney(raw: string | null | undefined): number | null {
  const n = Number((raw ?? "").trim())
  return raw?.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/**
 * Wix product page slugs are derived from the product name and de-duplicated with -1, -2 … in
 * creation order (e.g. tor-aso-oke-cap, tor-aso-oke-cap-1). Input must be in export order.
 */
export function wixProductSlugs(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const base = slugify(n) || "product"
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  })
}

// ---------------------------------------------------------------- size charts

export interface SizeChartRow {
  label: string
  uk?: string
  us?: string
  eu?: string
  measurements: Record<string, string>
}

/** Parse a Wix HTML size chart table (first row = headers). Returns [] when no table is found. */
export function parseSizeChartTable(html: string): SizeChartRow[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
    ),
  )
  if (rows.length < 2) return []
  const header = rows[0]!.map((h) => h.toLowerCase())
  return rows.slice(1).flatMap((r) => {
    const label = r[0] ?? ""
    if (!label) return []
    const row: SizeChartRow = { label, measurements: {} }
    header.forEach((h, i) => {
      if (i === 0) return
      const v = r[i]
      if (!v) return
      if (h === "uk") row.uk = v
      else if (h === "us") row.us = v
      else if (h === "eu") row.eu = v
      else if (h) row.measurements[h] = v
    })
    return [row]
  })
}
