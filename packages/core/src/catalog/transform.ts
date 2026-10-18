/**
 * Transform the Wix product export (docs/catalog-export.csv) into Haanta products. Pure: no I/O.
 * Rows that cannot be mapped are reported in `review` (written to the review CSV by the script).
 */
import { sanitizeRichText } from "../security/sanitize"
import {
  canonicalBrand,
  classifyCollections,
  cleanOptionValue,
  inferCategory,
  isMadeToOrderValue,
  normaliseOption,
  parseImages,
  parseMoney,
  parseSizeChartTable,
  parseWeightKg,
  parseWixInventory,
  slugify,
  splitCollections,
  wixProductSlugs,
  type BrandDef,
  type NormalisedOption,
  type SizeChartRow,
  type StockLocationCode,
} from "./mapping"

export type ReviewSeverity = "blocker" | "warning" | "info"
export interface ReviewRow {
  handle_id: string
  name: string
  severity: ReviewSeverity
  issue: string
  detail: string
}

export interface MigratedVariant {
  title: string
  sku: string | null
  options: Record<string, string>
  vendor_price_minor: number
  vendor_price_source: "cost" | "derived"
  wix_price_minor: number
  weight_kg: number | null
  stock_location: StockLocationCode
  quantity: number | null
  fulfilment_type: "ready_to_wear" | "made_to_order" | null
}

export interface MigratedProduct {
  wix_handle_id: string
  wix_slug: string
  handle: string
  name: string
  vendor: BrandDef
  category_handle: string | null
  origin: StockLocationCode
  visible: boolean
  is_preorder: boolean
  fulfilment_type: "ready_to_wear" | "made_to_order"
  lead_time_days: number | null
  required_measurements: string[]
  options: { title: string; values: string[] }[]
  variants: MigratedVariant[]
  images: string[]
  description: string
  styles: string[]
  shops: string[]
  merch: string[]
  promotions: string[]
  sale_percent: number | null
  size_chart: SizeChartRow[] | null
}

export interface TransformResult {
  products: MigratedProduct[]
  skipped: { wix_handle_id: string; wix_slug: string; name: string }[]
  review: ReviewRow[]
  vendors: BrandDef[]
  /** Vendor markup overrides (basis points) derived from the Wix price ÷ cost ratio, so prices stay as today. */
  vendorMarkups: Record<string, number>
  stats: Record<string, number>
}

export interface TransformOptions {
  /** Global markup used to back-derive a vendor price from the Wix retail price when cost is missing. */
  markupBps: number
  /** Retail price the new platform will charge for a vendor price at a markup (server pricing rules). */
  retailFor: (vendorMinor: number, markupBps: number) => number
}

const MEASUREMENTS = ["bust", "waist", "hips", "height"]

/** Group the flat export into one product row followed by its variant rows. */
function groupRows(rows: Record<string, string>[]) {
  const groups: { product: Record<string, string>; variants: Record<string, string>[] }[] = []
  for (const r of rows) {
    if (r.fieldType === "Product") groups.push({ product: r, variants: [] })
    else if (r.fieldType === "Variant" && groups.length && groups.at(-1)!.product.handleId === r.handleId) groups.at(-1)!.variants.push(r)
  }
  return groups
}

function additionalInfo(p: Record<string, string>): { title: string; html: string }[] {
  const out: { title: string; html: string }[] = []
  for (let i = 1; i <= 6; i++) {
    const title = (p[`additionalInfoTitle${i}`] ?? "").trim()
    if (title) out.push({ title, html: p[`additionalInfoDescription${i}`] ?? "" })
  }
  return out
}

function leadTimeFrom(text: string): number | null {
  const nums = [...text.replace(/<[^>]+>/g, " ").matchAll(/(\d{1,3})\s*(?:-|to|–)?\s*(\d{1,3})?\s*(?:business\s+|working\s+)?days/gi)].flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number))
  return nums.length ? Math.max(...nums) : null
}

/** Median Wix price ÷ cost per brand (products that have a cost), rounded to whole percent. */
function deriveVendorMarkups(groups: ReturnType<typeof groupRows>): Record<string, number> {
  const ratios = new Map<string, number[]>()
  for (const { product: p } of groups) {
    const brand = canonicalBrand(p.brand) ?? classifyCollections(splitCollections(p.collection)).brand ?? canonicalBrand(p.ribbon)
    const price = parseMoney(p.price)
    const cost = parseMoney(p.cost)
    if (!brand || !price || !cost) continue
    const r = price / cost
    if (r < 1 || r > 3) continue // ignore data-entry outliers
    ratios.set(brand.slug, [...(ratios.get(brand.slug) ?? []), r])
  }
  const out: Record<string, number> = {}
  for (const [slug, list] of ratios) {
    const sorted = [...list].sort((a, b) => a - b)
    const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
    out[slug] = Math.round((mid - 1) * 100) * 100
  }
  return out
}

export function transformCatalog(rows: Record<string, string>[], opts: TransformOptions): TransformResult {
  const groups = groupRows(rows)
  const vendorMarkups = deriveVendorMarkups(groups)
  const wixSlugs = wixProductSlugs(groups.map((g) => g.product.name ?? ""))
  const review: ReviewRow[] = []
  const products: MigratedProduct[] = []
  const skipped: TransformResult["skipped"] = []
  const vendors = new Map<string, BrandDef>()
  const handles = new Set<string>()
  // Wix SKUs are not unique per variant (one SKU is often shared by every size). Medusa needs unique
  // SKUs, so the first use keeps the Wix SKU and later uses get the variant options appended.
  const skus = new Set<string>()
  const uniqueSku = (raw: string | null, variantTitle: string): { sku: string | null; renamed: boolean } => {
    if (!raw) return { sku: null, renamed: false }
    const base = raw.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "-").slice(0, 40)
    if (!skus.has(base)) {
      skus.add(base)
      return { sku: base, renamed: false }
    }
    const suffix = variantTitle.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "V"
    let candidate = `${base}-${suffix}`.slice(0, 64)
    for (let n = 2; skus.has(candidate); n++) candidate = `${base}-${suffix}-${n}`.slice(0, 64)
    skus.add(candidate)
    return { sku: candidate, renamed: true }
  }
  const stats: Record<string, number> = { products_in_export: groups.length, variants_in_export: 0 }
  const note = (p: Record<string, string>, severity: ReviewSeverity, issue: string, detail: string) =>
    review.push({ handle_id: p.handleId ?? "", name: p.name ?? "", severity, issue, detail })

  groups.forEach((g, gi) => {
    const p = g.product
    stats.variants_in_export! += g.variants.length
    const collections = splitCollections(p.collection)
    const c = classifyCollections(collections)
    const brand = canonicalBrand(p.brand) ?? c.brand ?? canonicalBrand(p.ribbon)
    if (!brand) {
      note(p, "blocker", "no_brand", `No brand in brand field, collections or ribbon (collections: ${collections.join("; ") || "none"})`)
      skipped.push({ wix_handle_id: p.handleId!, wix_slug: wixSlugs[gi]!, name: p.name! })
      return
    }
    if (!p.brand?.trim()) note(p, "info", "brand_inferred", `Brand "${brand.name}" taken from ${c.brand ? "collections" : "ribbon"}`)
    else if (canonicalBrand(p.brand)?.name !== p.brand.trim()) note(p, "info", "brand_merged", `"${p.brand.trim()}" merged into "${brand.name}"`)
    vendors.set(brand.slug, brand)
    for (const u of c.unknown) note(p, "info", "unknown_collection", u)

    const category = inferCategory(p.name ?? "", c)
    if (!category) note(p, "warning", "no_category", "No category from name or collections; imported uncategorised")
    else if (category.source === "weak_collection") note(p, "info", "category_low_confidence", `${category.handle} (from a bulk-applied Wix collection)`)

    const info = additionalInfo(p)
    const preorderInfo = info.find((x) => /pre-?order/i.test(x.title))
    const isPreorder = !!preorderInfo || /pre-?order/i.test(p.ribbon ?? "") || collections.some((x) => /^pre-?order$/i.test(x.trim()))
    const chartInfo = info.find((x) => /size chart/i.test(x.title))
    const sizeChart = chartInfo ? parseSizeChartTable(chartInfo.html) : []

    // Options
    const opts_: { def: NormalisedOption; index: number }[] = []
    for (let i = 1; i <= 6; i++) {
      const name = (p[`productOptionName${i}`] ?? "").trim()
      if (!name) continue
      opts_.push({ def: normaliseOption(name, p[`productOptionType${i}`] ?? "", p[`productOptionDescription${i}`] ?? ""), index: i })
    }
    const titles = new Map<string, number>()
    const optionTitles = opts_.map((o) => {
      const t = o.def.title
      const n = (titles.get(t) ?? 0) + 1
      titles.set(t, n)
      return n === 1 ? t : o.def.sourceName
    })

    // Variants
    const basePrice = parseMoney(p.price) ?? 0
    const productCost = parseMoney(p.cost)
    const discount = p.discountMode === "PERCENT" ? Number(p.discountValue) || 0 : 0
    const location: StockLocationCode = c.origin ?? "lagos"
    const markupBps = vendorMarkups[brand.slug] ?? opts.markupBps
    const variantRows = g.variants.length ? g.variants : [p]
    const seen = new Set<string>()
    const variants: MigratedVariant[] = []
    let missingWeight = 0
    let derived = 0
    let renamedSkus = 0
    for (const v of variantRows) {
      const values: Record<string, string> = {}
      let mto = false
      opts_.forEach((o, k) => {
        const raw = (v === p ? (o.def.values[0]?.value ?? "") : (v[`productOptionDescription${o.index}`] ?? "")).trim()
        const value = cleanOptionValue(raw).value || o.def.values[0]?.value || "Standard"
        values[optionTitles[k]!] = value
        if (isMadeToOrderValue(o.def.kind, value)) mto = true
      })
      if (!opts_.length) values.Style = "Standard"
      const key = JSON.stringify(values)
      if (seen.has(key)) {
        note(p, "warning", "duplicate_variant", `Duplicate option combination ${Object.values(values).join(" / ")} dropped`)
        continue
      }
      seen.add(key)
      const surcharge = parseMoney(v.surcharge) ?? 0
      const wixPrice = (parseMoney(v === p ? "" : v.price) ?? basePrice) + surcharge
      const cost = parseMoney(v === p ? "" : v.cost) ?? productCost
      const vendorPrice = cost && cost > 0 ? cost : Math.max(1, Math.round((wixPrice * 10_000) / (10_000 + markupBps)))
      if (!(cost && cost > 0)) derived++
      const weight = parseWeightKg(v === p ? p.weight : v.weight)
      if (!weight) missingWeight++
      const inv = parseWixInventory(v.inventory ?? p.inventory)
      const variantTitle = Object.values(values).join(" / ")
      const { sku, renamed } = uniqueSku((v === p ? "" : v.sku)?.trim() || null, variantTitle)
      if (renamed) renamedSkus++
      variants.push({
        title: variantTitle,
        sku,
        options: values,
        vendor_price_minor: vendorPrice,
        vendor_price_source: cost && cost > 0 ? "cost" : "derived",
        wix_price_minor: wixPrice,
        weight_kg: weight,
        stock_location: location,
        quantity: mto ? null : inv.manage ? inv.quantity : null,
        fulfilment_type: mto ? "made_to_order" : null,
      })
    }
    if (!variants.length) {
      note(p, "blocker", "no_variants", "No usable variants")
      skipped.push({ wix_handle_id: p.handleId!, wix_slug: wixSlugs[gi]!, name: p.name! })
      return
    }
    if (renamedSkus) note(p, "info", "sku_renamed", `${renamedSkus} variant SKU(s) were shared with other variants in Wix and were made unique`)
    if (missingWeight) note(p, "info", "missing_weight", `${missingWeight} variant(s) without weight: shipping uses the 1.5 kg default and the product is flagged in Catalog health`)
    if (derived) note(p, "info", "vendor_price_derived", `${derived} variant(s) had no cost; vendor price derived from the Wix price ÷ (1 + markup). Confirm with the vendor.`)
    const changed = variants.filter((v) => Math.abs(opts.retailFor(v.vendor_price_minor, markupBps) - v.wix_price_minor) >= 100)
    if (changed.length) {
      const v = changed[0]!
      note(p, "warning", "price_change", `${changed.length} variant(s) change price, e.g. ${v.title}: Wix $${(v.wix_price_minor / 100).toFixed(2)} → $${(opts.retailFor(v.vendor_price_minor, markupBps) / 100).toFixed(2)}`)
    }
    if (discount > 0) {
      const below = variants.filter((v) => Math.round(opts.retailFor(v.vendor_price_minor, markupBps) * (1 - discount / 100)) < v.vendor_price_minor)
      if (below.length) note(p, "warning", "sale_below_vendor_price", `${discount}% sale would sell ${below.length} variant(s) below the vendor price`)
    }

    const images = parseImages(p.productImageUrl)
    const rawImages = splitCollections(p.productImageUrl)
    if (rawImages.length !== images.length) note(p, "warning", "invalid_image", `${rawImages.length - images.length} image reference(s) rejected`)
    if (!images.length) note(p, "warning", "no_images", "Product has no images")

    const allMto = variants.every((v) => v.fulfilment_type === "made_to_order")
    const anyMto = variants.some((v) => v.fulfilment_type === "made_to_order")
    const customText = (p.customTextField1 ?? "").trim()
    let handle = `${slugify(p.name ?? "product").slice(0, 80) || "product"}-${brand.slug}`
    for (let n = 2; handles.has(handle); n++) handle = `${slugify(p.name ?? "product").slice(0, 80)}-${brand.slug}-${n}`
    handles.add(handle)

    products.push({
      wix_handle_id: p.handleId!,
      wix_slug: wixSlugs[gi]!,
      handle,
      name: (p.name ?? "").trim(),
      vendor: brand,
      category_handle: category?.handle ?? null,
      origin: location,
      visible: (p.visible ?? "true") !== "false",
      is_preorder: isPreorder,
      fulfilment_type: allMto ? "made_to_order" : "ready_to_wear",
      lead_time_days: anyMto || isPreorder ? (leadTimeFrom(preorderInfo?.html ?? "") ?? 21) : null,
      required_measurements: anyMto || customText ? MEASUREMENTS : [],
      options: opts_.length ? opts_.map((o, k) => ({ title: optionTitles[k]!, values: [...new Set(variants.map((v) => v.options[optionTitles[k]!]!))] })) : [{ title: "Style", values: ["Standard"] }],
      variants,
      images,
      description: sanitizeRichText(p.description),
      styles: c.styles,
      shops: c.shops,
      merch: c.merch,
      promotions: c.promotions,
      sale_percent: discount > 0 ? discount : null,
      size_chart: sizeChart.length ? sizeChart : null,
    })
  })

  stats.products_mapped = products.length
  stats.products_skipped = skipped.length
  stats.variants_mapped = products.reduce((n, p) => n + p.variants.length, 0)
  stats.vendors = vendors.size
  stats.review_blockers = review.filter((r) => r.severity === "blocker").length
  stats.review_warnings = review.filter((r) => r.severity === "warning").length
  return { products, skipped, review, vendors: [...vendors.values()], vendorMarkups, stats }
}

/** 301 redirects from every Wix product URL (name slug and legacy handle) to the new product URL. */
export function buildRedirects(result: TransformResult): { from: string; to: string }[] {
  const out = new Map<string, string>()
  // Name slugs are the real Wix product URLs, so they always win.
  for (const p of result.products) out.set(`/product-page/${p.wix_slug}`, `/products/${p.handle}`)
  for (const s of result.skipped) out.set(`/product-page/${s.wix_slug}`, "/shop")
  // Legacy handle aliases only fill gaps; they never override a real product URL.
  for (const p of result.products) {
    if (/^product_[0-9a-f-]{36}$/.test(p.wix_handle_id)) continue
    const alias = `/product-page/${slugify(p.wix_handle_id)}`
    if (!out.has(alias)) out.set(alias, `/products/${p.handle}`)
  }
  return [...out.entries()].map(([from, to]) => ({ from, to }))
}
