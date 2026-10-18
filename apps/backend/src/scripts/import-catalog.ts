/**
 * Wix catalog import (docs/catalog-export.csv → Haanta).
 *
 *   pnpm --filter @haanta/backend import:catalog dry-run           # review only, no writes
 *   pnpm --filter @haanta/backend import:catalog                   # import (idempotent; re-runs update)
 *   options: file=<csv> limit=<n> out=<dir> only-new (skip products that already exist)
 *
 * Writes <out>/review.csv (rows it could not map or that need a human), <out>/summary.json,
 * <out>/redirects.csv and, on a real run, apps/storefront/redirects.json (301s from every Wix URL).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ExecArgs, IPromotionModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createPriceListsWorkflow } from "@medusajs/medusa/core-flows"
import { buildRedirects, parseCsvObjects, toCsv, transformCatalog, type MigratedProduct } from "@haanta/core"
import { computeRetailMinor } from "@haanta/pricing"
import { setupStore } from "../lib/setup-store"
import { applyListing } from "../lib/catalog-ops"
import { getImageMirror } from "../lib/adapters"
import { invalidateSearchCache } from "../lib/search"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import type { ListingSnapshot } from "../lib/listing-schema"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/** `medusa exec` only passes positional arguments: use `dry-run`, `limit=10`, `file=…`, `out=…`. */
function arg(args: string[], name: string): string | undefined {
  return args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1)
}

export default async function importCatalog({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const dryRun = args.includes("dry-run")
  /** Skip products that already exist (faster re-run after fixing failures). */
  const onlyNew = args.includes("only-new")
  const repo = resolve(process.cwd(), "..", "..")
  const file = resolve(arg(args, "file") ?? join(repo, "docs", "catalog-export.csv"))
  const outDir = resolve(arg(args, "out") ?? join(process.cwd(), "migration-output"))
  const limit = Number(arg(args, "limit") ?? Infinity)
  mkdirSync(outDir, { recursive: true })

  const pricing = await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("pricing")
  const rows = parseCsvObjects(readFileSync(file, "utf8"))
  const result = transformCatalog(rows, {
    markupBps: pricing.globalMarkup.percentBps,
    retailFor: (v, bps) => computeRetailMinor(v, { percentBps: bps, fixedMinor: 0 }, pricing.rounding),
  })
  const redirects = buildRedirects(result)
  writeFileSync(join(outDir, "review.csv"), toCsv(["severity", "issue", "handle_id", "name", "detail"], result.review))
  writeFileSync(join(outDir, "redirects.csv"), toCsv(["from", "to"], redirects))
  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ dry_run: dryRun, file, ...result.stats, vendor_markups_bps: result.vendorMarkups }, null, 2))
  logger.info(`[import] ${JSON.stringify(result.stats)}`)
  logger.info(`[import] review: ${join(outDir, "review.csv")}`)
  if (dryRun) {
    logger.info("[import] dry run: nothing written to the database")
    return
  }

  const setup = await setupStore(container, logger)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const mirror = getImageMirror()

  // Vendors (with markups derived from today's Wix prices so retail stays the same)
  const vendorIds = new Map<string, string>()
  for (const b of result.vendors) {
    let [v] = await marketplace.listVendors({ slug: b.slug })
    if (!v) {
      v = await marketplace.createVendors({ name: b.name, slug: b.slug, status: "active", origin_country: "NG", region: "Nigeria", markup_bps: result.vendorMarkups[b.slug] ?? null, markup_fixed_minor: result.vendorMarkups[b.slug] != null ? 0 : null })
    }
    vendorIds.set(b.slug, v.id)
  }

  // Size charts, de-duplicated per vendor
  const chartIds = new Map<string, string>()
  const chartFor = async (p: MigratedProduct): Promise<string | null> => {
    if (!p.size_chart) return null
    const vendorId = vendorIds.get(p.vendor.slug)!
    const key = `${vendorId}:${JSON.stringify(p.size_chart)}`
    if (chartIds.has(key)) return chartIds.get(key)!
    const name = `Size chart ${chartIds.size + 1} (from Wix)`
    const existing = (await marketplace.listSizeCharts({ vendor_id: vendorId })).find((c) => JSON.stringify(c.rows) === JSON.stringify(p.size_chart))
    const chart = existing ?? (await marketplace.createSizeCharts({ name, unit: "in", rows: p.size_chart as never, vendor_id: vendorId } as never))
    chartIds.set(key, chart.id)
    return chart.id
  }

  let imported = 0
  let updated = 0
  const failures: { handle_id: string; name: string; error: string }[] = []
  const promoProducts: Record<string, string[]> = {}
  const salePrices: { variant_id: string; currency_code: string; amount: number }[] = []
  for (const p of result.products.slice(0, limit)) {
    try {
      const vendorId = vendorIds.get(p.vendor.slug)!
      const { data: existing } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: p.handle } })
      if (existing.length && onlyNew) continue
      const images: string[] = []
      for (const url of p.images) images.push(await mirror.mirror(url, `vendors/${vendorId}/product`))
      const snapshot: ListingSnapshot = {
        title: p.name,
        subtitle: null,
        description: p.description,
        material: null,
        care: null,
        category_ids: p.category_handle && setup.category_ids[p.category_handle] ? [setup.category_ids[p.category_handle]!] : [],
        images,
        fulfilment_type: p.fulfilment_type,
        lead_time_days: p.lead_time_days,
        is_preorder: p.is_preorder,
        required_measurements: p.required_measurements as ListingSnapshot["required_measurements"],
        size_chart_id: await chartFor(p),
        fit_notes: null,
        styles: p.styles,
        options: p.options,
        variants: p.variants.map((v) => ({
          title: v.title,
          sku: v.sku && /^[A-Za-z0-9._-]{1,64}$/.test(v.sku) ? v.sku : null,
          options: v.options,
          vendor_price_minor: v.vendor_price_minor,
          vendor_currency: "USD" as const,
          weight_kg: v.weight_kg,
          stock_location: v.stock_location,
          quantity: v.quantity,
          fulfilment_type: v.fulfilment_type,
        })),
      }
      const productId = (existing[0]?.id as string | undefined) ?? null
      const { product_id, prices } = await applyListing(container, {
        listing_id: "",
        vendor_id: vendorId,
        product_id: productId,
        snapshot,
        handle: p.handle,
        status: p.visible ? "published" : "draft",
        metadata: { wix_handle_id: p.wix_handle_id, wix_slug: p.wix_slug, migrated_from: "wix" },
        merch: { shops: p.shops, merch: p.merch, styles: p.styles },
      })
      const [listing] = await marketplace.listProductListings({ product_id })
      if (listing) await marketplace.updateProductListings({ id: listing.id, title: p.name, status: "live", approved_snapshot: snapshot as never, pending_snapshot: null })
      else await marketplace.createProductListings({ vendor_id: vendorId, product_id, title: p.name, status: "live", approved_snapshot: snapshot as never, weight_missing: snapshot.variants.some((v) => !v.weight_kg) })
      if (productId) updated++
      else imported++
      for (const promo of p.promotions) (promoProducts[promo] ??= []).push(product_id)
      if (p.sale_percent) {
        const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id", "title"], filters: { product_id } })
        snapshot.variants.forEach((v, i) => {
          const variant = variants.find((x) => x.title === v.title)
          if (!variant) return
          for (const [currency, retail] of Object.entries(prices[i]!.retail)) {
            const sale = Math.round((retail * (100 - p.sale_percent!)) / 100 / 100) * 100
            if (sale >= prices[i]!.vendorPriceUsdMinor) salePrices.push({ variant_id: variant.id as string, currency_code: currency.toLowerCase(), amount: sale / 100 })
          }
        })
      }
      if ((imported + updated) % 50 === 0) logger.info(`[import] ${imported + updated}/${Math.min(limit, result.products.length)}`)
    } catch (e) {
      failures.push({ handle_id: p.wix_handle_id, name: p.name, error: (e as Error).message.slice(0, 300) })
    }
  }

  // Sale prices from Wix discounts → one "sale" price list
  const { data: lists } = await query.graph({ entity: "price_list", fields: ["id", "title"] })
  if (salePrices.length && !lists.some((l) => l.title === "Wix sales (migrated)")) {
    await createPriceListsWorkflow(container).run({
      input: { price_lists_data: [{ title: "Wix sales (migrated)", description: "Discounts carried over from Wix", type: "sale", status: "active", prices: salePrices }] } as never,
    })
  }

  // Attach migrated products to the Black Friday / 15% / free-shipping promotions
  const promotions = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
  const codeFor: Record<string, string> = { "black-friday": "BLACKFRIDAY", "fifteen-percent-off": "FIFTEEN", "free-shipping": "FREESHIP" }
  for (const [key, productIds] of Object.entries(promoProducts)) {
    const code = codeFor[key]
    if (!code || !productIds.length) continue
    const [promo] = await promotions.listPromotions({ code })
    if (!promo || key === "free-shipping") continue // free shipping targets shipping methods, not products
    try {
      await promotions.addPromotionTargetRules(promo.id, [{ attribute: "items.product.id", operator: "in", values: productIds }])
    } catch (e) {
      logger.warn(`[import] could not attach products to ${code}: ${(e as Error).message}`)
    }
  }

  invalidateSearchCache()
  const storefrontRedirects = join(repo, "apps", "storefront", "redirects.json")
  writeFileSync(storefrontRedirects, JSON.stringify(redirects, null, 2) + "\n")
  writeFileSync(join(outDir, "failures.csv"), toCsv(["handle_id", "name", "error"], failures))
  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ dry_run: false, file, ...result.stats, imported, updated, failed: failures.length, sale_prices: salePrices.length, vendor_markups_bps: result.vendorMarkups }, null, 2))
  logger.info(`[import] done: ${imported} imported, ${updated} updated, ${failures.length} failed; redirects → ${storefrontRedirects}`)
}
