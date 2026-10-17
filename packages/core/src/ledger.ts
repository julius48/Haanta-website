/**
 * Vendor ledger domain logic (pure). The ledger is append-only: entries, deliveries, payouts and
 * payout allocations are only ever inserted. Status is derived, never stored on the entry.
 *
 *   sale entry      +vendor_price × qty, created when an order line is paid
 *   reversal entry  −amount, for refunds, cancellations and returns (never more than the sale)
 *   status          paid (allocated to a payout) > payable (delivered + return window elapsed) > pending
 */

export type LedgerEntryType = "sale" | "reversal"
export type ReversalReason = "refund" | "cancellation" | "return"
export type LedgerStatus = "pending" | "payable" | "paid"

export interface LedgerEntry {
  id: string
  vendor_id: string
  order_id: string
  order_line_id: string
  type: LedgerEntryType
  /** Signed minor units: sales positive, reversals negative. */
  amount_minor: number
  currency: string
  quantity: number
  unit_vendor_price_minor: number
  reverses_entry_id: string | null
  reason: ReversalReason | null
  created_at: Date
}

export interface DeliveryRecord {
  order_id: string
  vendor_id: string
  delivered_at: Date
  /** Snapshot of the return-window setting when delivery was recorded. */
  return_window_days: number
}

export interface Payout {
  id: string
  vendor_id: string
  amount_minor: number
  currency: string
  paid_at: Date
  bank_reference: string
}

export interface PayoutAllocation {
  payout_id: string
  entry_id: string
}

export class LedgerError extends Error {
  constructor(
    public code:
      | "invalid_quantity"
      | "over_reversal"
      | "not_a_sale"
      | "not_payable"
      | "wrong_vendor"
      | "amount_mismatch"
      | "empty_payout"
      | "duplicate_entry",
    message: string,
  ) {
    super(message)
  }
}

export interface PaidOrderLine {
  order_id: string
  order_line_id: string
  vendor_id: string
  quantity: number
  /** Snapshot of the variant's vendor price at purchase time. */
  vendor_price_minor: number
  currency: string
}

/** Sale entries for a paid order. Idempotent when given existing entries for the order. */
export function saleEntriesForOrder(
  lines: PaidOrderLine[],
  existing: Pick<LedgerEntry, "order_line_id" | "type">[],
  newId: () => string,
  now: Date,
): LedgerEntry[] {
  const done = new Set(existing.filter((e) => e.type === "sale").map((e) => e.order_line_id))
  return lines
    .filter((l) => !done.has(l.order_line_id))
    .map((l) => {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new LedgerError("invalid_quantity", "quantity must be a positive integer")
      if (!Number.isInteger(l.vendor_price_minor) || l.vendor_price_minor < 0) throw new LedgerError("invalid_quantity", "vendor price must be a non-negative integer")
      return {
        id: newId(),
        vendor_id: l.vendor_id,
        order_id: l.order_id,
        order_line_id: l.order_line_id,
        type: "sale" as const,
        amount_minor: l.vendor_price_minor * l.quantity,
        currency: l.currency,
        quantity: l.quantity,
        unit_vendor_price_minor: l.vendor_price_minor,
        reverses_entry_id: null,
        reason: null,
        created_at: now,
      }
    })
}

/** Units of a sale not yet reversed. */
export function remainingQuantity(sale: LedgerEntry, entries: LedgerEntry[]): number {
  const reversed = entries
    .filter((e) => e.type === "reversal" && e.reverses_entry_id === sale.id)
    .reduce((s, e) => s + e.quantity, 0)
  return sale.quantity - reversed
}

/** A reversing entry for `quantity` units of a sale (full or partial refund/return/cancellation). */
export function createReversal(
  sale: LedgerEntry,
  entries: LedgerEntry[],
  quantity: number,
  reason: ReversalReason,
  newId: () => string,
  now: Date,
): LedgerEntry {
  if (sale.type !== "sale") throw new LedgerError("not_a_sale", "only sale entries can be reversed")
  if (!Number.isInteger(quantity) || quantity <= 0) throw new LedgerError("invalid_quantity", "quantity must be a positive integer")
  if (quantity > remainingQuantity(sale, entries)) throw new LedgerError("over_reversal", "cannot reverse more than was sold")
  return {
    id: newId(),
    vendor_id: sale.vendor_id,
    order_id: sale.order_id,
    order_line_id: sale.order_line_id,
    type: "reversal",
    amount_minor: -sale.unit_vendor_price_minor * quantity,
    currency: sale.currency,
    quantity,
    unit_vendor_price_minor: sale.unit_vendor_price_minor,
    reverses_entry_id: sale.id,
    reason,
    created_at: now,
  }
}

export interface LedgerState {
  entries: LedgerEntry[]
  deliveries: DeliveryRecord[]
  allocations: PayoutAllocation[]
}

const DAY_MS = 86_400_000

export function payableAt(delivery: DeliveryRecord): Date {
  return new Date(delivery.delivered_at.getTime() + delivery.return_window_days * DAY_MS)
}

export function entryStatus(entry: LedgerEntry, state: LedgerState, now: Date): LedgerStatus {
  if (state.allocations.some((a) => a.entry_id === entry.id)) return "paid"
  if (entry.type === "reversal" && entry.reverses_entry_id) {
    const sale = state.entries.find((e) => e.id === entry.reverses_entry_id)
    if (sale) {
      const saleStatus = entryStatus(sale, state, now)
      // Reversal of an already-paid sale is deducted from the next payout.
      return saleStatus === "paid" ? "payable" : saleStatus
    }
  }
  const delivery = state.deliveries.find((d) => d.order_id === entry.order_id && d.vendor_id === entry.vendor_id)
  if (delivery && now.getTime() >= payableAt(delivery).getTime()) return "payable"
  return "pending"
}

export interface VendorBalance {
  vendor_id: string
  pending_minor: number
  payable_minor: number
  paid_minor: number
  /** Everything earned net of reversals. */
  lifetime_minor: number
}

export function vendorBalance(vendorId: string, state: LedgerState, now: Date): VendorBalance {
  const b: VendorBalance = { vendor_id: vendorId, pending_minor: 0, payable_minor: 0, paid_minor: 0, lifetime_minor: 0 }
  for (const e of state.entries) {
    if (e.vendor_id !== vendorId) continue
    const s = entryStatus(e, state, now)
    b[`${s}_minor`] += e.amount_minor
    b.lifetime_minor += e.amount_minor
  }
  return b
}

export function payableEntries(vendorId: string, state: LedgerState, now: Date): LedgerEntry[] {
  return state.entries
    .filter((e) => e.vendor_id === vendorId && entryStatus(e, state, now) === "payable")
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
}

/**
 * Validate a manual payout. The admin selects entries (default: all payable) and enters the amount
 * actually sent; it must equal the selected entries' sum so typos are caught.
 */
export function planPayout(
  input: { vendor_id: string; amount_minor: number; entry_ids?: string[] },
  state: LedgerState,
  now: Date,
): { entry_ids: string[]; amount_minor: number } {
  const payable = payableEntries(input.vendor_id, state, now)
  let selected: LedgerEntry[]
  if (input.entry_ids) {
    const unique = [...new Set(input.entry_ids)]
    selected = unique.map((id) => {
      const e = state.entries.find((x) => x.id === id)
      if (!e) throw new LedgerError("not_payable", `entry ${id} not found`)
      if (e.vendor_id !== input.vendor_id) throw new LedgerError("wrong_vendor", `entry ${id} belongs to another vendor`)
      if (!payable.includes(e)) throw new LedgerError("not_payable", `entry ${id} is not payable`)
      return e
    })
  } else {
    selected = payable
  }
  if (selected.length === 0) throw new LedgerError("empty_payout", "nothing is payable")
  const sum = selected.reduce((s, e) => s + e.amount_minor, 0)
  if (sum <= 0) throw new LedgerError("empty_payout", "selected entries net to zero or less")
  if (sum !== input.amount_minor) {
    throw new LedgerError("amount_mismatch", `amount ${input.amount_minor} does not match payable total ${sum}`)
  }
  return { entry_ids: selected.map((e) => e.id), amount_minor: sum }
}

export interface ReconciliationRow {
  vendor_id: string
  ledger_paid_minor: number
  payouts_minor: number
  difference_minor: number
  pending_minor: number
  payable_minor: number
  ok: boolean
}

/** Compare ledger totals with recorded payouts per vendor. */
export function reconcile(vendorIds: string[], state: LedgerState, payouts: Payout[], now: Date): ReconciliationRow[] {
  return vendorIds.map((vendor_id) => {
    const bal = vendorBalance(vendor_id, state, now)
    const payoutsMinor = payouts.filter((p) => p.vendor_id === vendor_id).reduce((s, p) => s + p.amount_minor, 0)
    const difference = bal.paid_minor - payoutsMinor
    return {
      vendor_id,
      ledger_paid_minor: bal.paid_minor,
      payouts_minor: payoutsMinor,
      difference_minor: difference,
      pending_minor: bal.pending_minor,
      payable_minor: bal.payable_minor,
      ok: difference === 0,
    }
  })
}
