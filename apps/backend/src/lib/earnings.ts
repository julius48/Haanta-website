import type { MedusaContainer } from "@medusajs/framework/types"
import { entryStatus, vendorBalance, type LedgerEntry } from "@haanta/core"
import { LEDGER_MODULE, type LedgerService } from "../modules/ledger"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"

/** Ledger lines for one vendor with derived status, labelled with order number and product title. */
export async function vendorEarnings(container: MedusaContainer, vendorId: string, now = new Date()) {
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const { state, payouts } = await ledger.loadState(vendorId)
  const orderIds = [...new Set(state.entries.map((e) => e.order_id))]
  const [vendorOrders, snapshots] = orderIds.length
    ? await Promise.all([
        marketplace.listVendorOrders({ vendor_id: vendorId, order_id: orderIds }, { take: null }),
        marketplace.listLinePriceSnapshots({ vendor_id: vendorId, order_id: orderIds }, { take: null }),
      ])
    : [[], []]
  const label = (e: LedgerEntry) => ({
    order: vendorOrders.find((v) => v.order_id === e.order_id)?.display_id ?? e.order_id,
    product: snapshots.find((s) => s.line_item_id === e.order_line_id)?.product_title ?? "Product",
  })
  const allocationOf = new Map(state.allocations.map((a) => [a.entry_id, a.payout_id]))
  const entries = state.entries.map((e) => ({
    id: e.id,
    created_at: e.created_at.toISOString(),
    type: e.type,
    reason: e.reason,
    quantity: e.quantity,
    amount_minor: e.amount_minor,
    currency: e.currency,
    status: entryStatus(e, state, now),
    payout_id: allocationOf.get(e.id) ?? null,
    ...label(e),
  }))
  return {
    balance: vendorBalance(vendorId, state, now),
    entries: entries.reverse(),
    payouts: payouts.map((p) => ({ ...p, paid_at: p.paid_at.toISOString() })).reverse(),
    state,
  }
}
