import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../modules/haanta-settings"
import type { AnyRequest } from "../../../lib/http"
import { vendorEarnings } from "../../../lib/earnings"
import { marketplaceOf } from "../../../lib/vendor-onboarding"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/** Sales chart (net vendor earnings per day), best sellers, low-stock alerts and late orders. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const days = Math.min(365, Math.max(7, Number((req.query as Record<string, string>).days) || 90))
  const since = Date.now() - days * 86_400_000
  const marketplace = marketplaceOf(req)
  const { entries } = await vendorEarnings(req.scope, vc.vendor_id)

  const byDay = new Map<string, number>()
  for (const e of entries) {
    if (new Date(e.created_at).getTime() < since) continue
    const d = e.created_at.slice(0, 10)
    byDay.set(d, (byDay.get(d) ?? 0) + e.amount_minor)
  }
  const sales_by_day = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount_minor]) => ({ date, amount_minor }))

  const snapshots = await marketplace.listLinePriceSnapshots({ vendor_id: vc.vendor_id }, { take: null })
  const best = new Map<string, { product_id: string | null; title: string; units: number; earnings_minor: number }>()
  for (const s of snapshots) {
    const key = s.product_id ?? s.product_title ?? "unknown"
    const b = best.get(key) ?? { product_id: s.product_id, title: s.product_title ?? "Product", units: 0, earnings_minor: 0 }
    b.units += Number(s.quantity)
    b.earnings_minor += Number(s.quantity) * Number(s.vendor_price_minor)
    best.set(key, b)
  }
  const best_sellers = [...best.values()].sort((a, b) => b.units - a.units).slice(0, 10)

  const threshold = (await req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")).lowStockThreshold
  const pricing = await marketplace.listVariantPricings({ vendor_id: vc.vendor_id }, { take: null })
  const low_stock: { variant_id: string; product_id: string; title: string; available: number }[] = []
  if (pricing.length) {
    const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "product_id", "product.title", "manage_inventory", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
      filters: { id: pricing.map((p) => p.variant_id) },
    })
    for (const v of data) {
      if (!v.manage_inventory) continue
      const levels = ((v.inventory_items as { inventory?: { location_levels?: { stocked_quantity: number; reserved_quantity: number }[] } }[] | undefined) ?? []).flatMap((i) => i.inventory?.location_levels ?? [])
      const available = levels.reduce((n, l) => n + Number(l.stocked_quantity) - Number(l.reserved_quantity), 0)
      if (available <= threshold) low_stock.push({ variant_id: v.id as string, product_id: v.product_id as string, title: `${(v.product as { title?: string } | undefined)?.title ?? ""} – ${v.title}`, available })
    }
  }

  const open = await marketplace.listVendorOrders({ vendor_id: vc.vendor_id, status: ["new", "accepted", "in_production"] }, { take: null })
  const late_orders = open.filter((o) => o.ship_by && new Date(o.ship_by).getTime() < Date.now()).map((o) => ({ id: o.id, display_id: o.display_id, ship_by: o.ship_by, status: o.status }))
  res.json({ days, sales_by_day, best_sellers, low_stock, open_orders: open.length, late_orders, low_stock_threshold: threshold })
}
