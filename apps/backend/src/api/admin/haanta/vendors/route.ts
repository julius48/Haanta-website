import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import { LEDGER_MODULE, type LedgerService } from "../../../../modules/ledger"

/** Vendors with sales, fulfilment speed, late orders and markup overrides. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const ledger = req.scope.resolve<LedgerService>(LEDGER_MODULE)
  const status = (req.query as Record<string, string>).status
  const vendors = await marketplace.listVendors(status ? { status: status as never } : {}, { take: null, order: { name: "ASC" } })
  const [orders, entries, listings] = await Promise.all([
    marketplace.listVendorOrders({}, { take: null }),
    ledger.listLedgerEntries({}, { take: null }),
    marketplace.listProductListings({}, { take: null }),
  ])
  const now = Date.now()
  res.json({
    vendors: vendors.map((v) => {
      const vo = orders.filter((o) => o.vendor_id === v.id)
      const shipped = vo.filter((o) => o.shipped_at)
      const avgHours = shipped.length
        ? shipped.reduce((n, o) => n + (new Date(o.shipped_at!).getTime() - new Date(o.created_at).getTime()) / 3_600_000, 0) / shipped.length
        : null
      return {
        id: v.id,
        name: v.name,
        slug: v.slug,
        status: v.status,
        region: v.region,
        sales_minor: entries.filter((e) => e.vendor_id === v.id).reduce((n, e) => n + Number(e.amount_minor), 0),
        orders: vo.length,
        avg_hours_to_ship: avgHours === null ? null : Math.round(avgHours),
        late_orders: vo.filter((o) => !o.shipped_at && o.status !== "cancelled" && o.ship_by && new Date(o.ship_by).getTime() < now).length,
        live_products: listings.filter((l) => l.vendor_id === v.id && l.approved_snapshot).length,
        in_review: listings.filter((l) => l.vendor_id === v.id && l.status === "in_review").length,
        markup_bps: v.markup_bps,
        markup_fixed_minor: v.markup_fixed_minor,
      }
    }),
  })
}
