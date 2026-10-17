import { MedusaService } from "@medusajs/framework/utils"
import type { DeliveryRecord, LedgerEntry, LedgerState, Payout, PayoutAllocation } from "@haanta/core"
import { DeliveryRecordModel, LedgerEntryModel, PayoutAllocationModel, PayoutModel } from "./models"

class LedgerBase extends MedusaService({
  LedgerEntry: LedgerEntryModel,
  DeliveryRecord: DeliveryRecordModel,
  Payout: PayoutModel,
  PayoutAllocation: PayoutAllocationModel,
}) {}

type Row = Record<string, unknown>

export class LedgerService extends LedgerBase {
  /** Load the ledger state for one vendor (or all vendors) in the shape the core ledger logic expects. */
  async loadState(vendorId?: string): Promise<{ state: LedgerState; payouts: Payout[] }> {
    const filter = vendorId ? { vendor_id: vendorId } : {}
    const [entries, deliveries, payouts] = await Promise.all([
      this.listLedgerEntries(filter, { take: null, order: { created_at: "ASC" } }),
      this.listDeliveryRecords(filter, { take: null }),
      this.listPayouts(filter, { take: null }),
    ])
    const entryIds = entries.map((e) => e.id)
    const allocations = entryIds.length ? await this.listPayoutAllocations({ entry_id: entryIds }, { take: null }) : []
    return {
      state: {
        entries: entries.map((e) => toEntry(e as unknown as Row)),
        deliveries: deliveries.map((d) => ({
          order_id: d.order_id,
          vendor_id: d.vendor_id,
          delivered_at: new Date(d.delivered_at),
          return_window_days: Number(d.return_window_days),
        })) as DeliveryRecord[],
        allocations: allocations.map((a) => ({ payout_id: a.payout_id, entry_id: a.entry_id })) as PayoutAllocation[],
      },
      payouts: payouts.map((p) => ({
        id: p.id,
        vendor_id: p.vendor_id,
        amount_minor: Number(p.amount_minor),
        currency: p.currency,
        paid_at: new Date(p.paid_at),
        bank_reference: p.bank_reference,
      })),
    }
  }
}

function toEntry(e: Row): LedgerEntry {
  return {
    id: e.id as string,
    vendor_id: e.vendor_id as string,
    order_id: e.order_id as string,
    order_line_id: e.order_line_id as string,
    type: e.type as LedgerEntry["type"],
    amount_minor: Number(e.amount_minor),
    currency: e.currency as string,
    quantity: Number(e.quantity),
    unit_vendor_price_minor: Number(e.unit_vendor_price_minor),
    reverses_entry_id: (e.reverses_entry_id as string | null) ?? null,
    reason: (e.reason as LedgerEntry["reason"]) ?? null,
    created_at: new Date(e.created_at as string),
  }
}

// The ledger is append-only: block the generated update/delete methods at the service layer too.
for (const m of [
  "updateLedgerEntries", "deleteLedgerEntries", "softDeleteLedgerEntries", "restoreLedgerEntries",
  "updateDeliveryRecords", "deleteDeliveryRecords", "softDeleteDeliveryRecords", "restoreDeliveryRecords",
  "updatePayouts", "deletePayouts", "softDeletePayouts", "restorePayouts",
  "updatePayoutAllocations", "deletePayoutAllocations", "softDeletePayoutAllocations", "restorePayoutAllocations",
] as const) {
  Object.defineProperty(LedgerService.prototype, m, {
    value: () => {
      throw new Error("The ledger is append-only")
    },
  })
}
