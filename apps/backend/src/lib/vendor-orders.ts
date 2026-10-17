/**
 * Vendor order views. Built only from vendor_order, line price snapshots and order line items;
 * never from customer, email or address fields. Every view passes through toVendorOrderView.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { toVendorOrderView, type VendorOrderView } from "@haanta/core"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/** Fields of order line items vendors may see. Do not add customer/address fields here. */
const LINE_FIELDS = ["id", "items.id", "items.thumbnail", "items.variant_sku", "items.metadata"]

export async function buildVendorOrderViews(container: MedusaContainer, vendorId: string, vendorOrders: Record<string, unknown>[]): Promise<VendorOrderView[]> {
  if (!vendorOrders.length) return []
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const hub = (await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")).hubAddress
  const orderIds = vendorOrders.map((o) => o.order_id as string)
  const snapshots = await marketplace.listLinePriceSnapshots({ order_id: orderIds, vendor_id: vendorId }, { take: null })
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({ entity: "order", fields: LINE_FIELDS, filters: { id: orderIds } })
  const itemById = new Map<string, Record<string, unknown>>()
  for (const o of orders) for (const it of (o.items as Record<string, unknown>[] | undefined) ?? []) itemById.set(it.id as string, it)

  return vendorOrders.map((vo) =>
    toVendorOrderView(
      {
        id: vo.id as string,
        display_id: vo.display_id as string,
        created_at: vo.created_at as string,
        vendor_status: vo.status as string,
        tracking_number: (vo.tracking_number as string | null) ?? null,
        tracking_carrier: (vo.tracking_carrier as string | null) ?? null,
        lines: snapshots
          .filter((s) => s.order_id === vo.order_id)
          .map((s) => {
            const item = itemById.get(s.line_item_id)
            const meta = (item?.metadata as { measurements?: Record<string, string | number> } | null) ?? null
            return {
              id: s.line_item_id,
              product_title: s.product_title ?? "Product",
              variant_title: s.variant_title,
              sku: (item?.variant_sku as string | null) ?? null,
              quantity: Number(s.quantity),
              vendor_price_minor: Number(s.vendor_price_minor),
              options: (s.variant_title ? { Variant: s.variant_title } : {}) as Record<string, string>,
              measurements: meta?.measurements ?? null,
              fulfilment_type: s.fulfilment_type,
              thumbnail: (item?.thumbnail as string | null) ?? null,
            }
          }),
      },
      hub,
    ),
  )
}

export const NEXT_STATUSES: Record<string, string[]> = {
  new: ["accepted"],
  accepted: ["in_production", "shipped_to_hub"],
  in_production: ["shipped_to_hub"],
  shipped_to_hub: [],
  received_at_hub: [],
  cancelled: [],
}
