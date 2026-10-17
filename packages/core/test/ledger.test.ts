import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  LedgerError,
  createReversal,
  entryStatus,
  planPayout,
  reconcile,
  saleEntriesForOrder,
  vendorBalance,
  type DeliveryRecord,
  type LedgerEntry,
  type LedgerState,
  type Payout,
} from "../src"

const DAY = 86_400_000
const t0 = new Date("2026-10-01T00:00:00Z")
const at = (days: number) => new Date(t0.getTime() + days * DAY)
let seq = 0
const id = () => `e${++seq}`

function sale(vendor: string, order: string, line: string, qty: number, price: number) {
  return saleEntriesForOrder([{ order_id: order, order_line_id: line, vendor_id: vendor, quantity: qty, vendor_price_minor: price, currency: "USD" }], [], id, t0)[0]!
}
const delivered = (order: string, vendor: string, day: number, window = 14): DeliveryRecord => ({ order_id: order, vendor_id: vendor, delivered_at: at(day), return_window_days: window })

describe("sale entries", () => {
  it("creates vendor price × quantity, pending", () => {
    const e = sale("v1", "o1", "l1", 3, 2500)
    expect(e.amount_minor).toBe(7500)
    expect(entryStatus(e, { entries: [e], deliveries: [], allocations: [] }, at(100))).toBe("pending")
  })

  it("is idempotent per order line", () => {
    const lines = [{ order_id: "o1", order_line_id: "l1", vendor_id: "v1", quantity: 1, vendor_price_minor: 100, currency: "USD" }]
    const first = saleEntriesForOrder(lines, [], id, t0)
    expect(saleEntriesForOrder(lines, first, id, t0)).toEqual([])
  })

  it("rejects invalid quantities and prices", () => {
    expect(() => saleEntriesForOrder([{ order_id: "o", order_line_id: "l", vendor_id: "v", quantity: 0, vendor_price_minor: 1, currency: "USD" }], [], id, t0)).toThrow(LedgerError)
    expect(() => saleEntriesForOrder([{ order_id: "o", order_line_id: "l", vendor_id: "v", quantity: 1, vendor_price_minor: -1, currency: "USD" }], [], id, t0)).toThrow(LedgerError)
  })
})

describe("status transitions", () => {
  it("becomes payable after delivery plus the return window", () => {
    const e = sale("v1", "o1", "l1", 1, 1000)
    const state: LedgerState = { entries: [e], deliveries: [delivered("o1", "v1", 5)], allocations: [] }
    expect(entryStatus(e, state, at(18))).toBe("pending")
    expect(entryStatus(e, state, at(19))).toBe("payable")
  })

  it("delivery of another vendor's part of the order does not make it payable", () => {
    const e = sale("v1", "o1", "l1", 1, 1000)
    const state: LedgerState = { entries: [e], deliveries: [delivered("o1", "v2", 0)], allocations: [] }
    expect(entryStatus(e, state, at(30))).toBe("pending")
  })

  it("is paid once allocated to a payout", () => {
    const e = sale("v1", "o1", "l1", 1, 1000)
    const state: LedgerState = { entries: [e], deliveries: [delivered("o1", "v1", 0)], allocations: [{ payout_id: "p1", entry_id: e.id }] }
    expect(entryStatus(e, state, at(30))).toBe("paid")
  })
})

describe("refunds, cancellations and returns", () => {
  it("a full cancellation before delivery nets the vendor balance to zero", () => {
    const s = sale("v1", "o1", "l1", 2, 1500)
    const r = createReversal(s, [s], 2, "cancellation", id, at(1))
    expect(r.amount_minor).toBe(-3000)
    const state: LedgerState = { entries: [s, r], deliveries: [], allocations: [] }
    expect(vendorBalance("v1", state, at(1))).toEqual({ vendor_id: "v1", pending_minor: 0, payable_minor: 0, paid_minor: 0, lifetime_minor: 0 })
  })

  it("a partial return leaves only the kept units payable", () => {
    const s = sale("v1", "o1", "l1", 3, 2000)
    const r = createReversal(s, [s], 1, "return", id, at(10))
    const state: LedgerState = { entries: [s, r], deliveries: [delivered("o1", "v1", 2)], allocations: [] }
    expect(vendorBalance("v1", state, at(20)).payable_minor).toBe(4000)
    expect(() => createReversal(s, [s, r], 3, "return", id, at(11))).toThrow(/more than was sold/)
    const r2 = createReversal(s, [s, r], 2, "refund", id, at(11))
    expect(vendorBalance("v1", { ...state, entries: [s, r, r2] }, at(20)).payable_minor).toBe(0)
  })

  it("a refund after payout becomes a payable deduction from the next payout", () => {
    const s1 = sale("v1", "o1", "l1", 1, 5000)
    const s2 = sale("v1", "o2", "l2", 1, 3000)
    let state: LedgerState = {
      entries: [s1, s2],
      deliveries: [delivered("o1", "v1", 0), delivered("o2", "v1", 0)],
      allocations: [{ payout_id: "p1", entry_id: s1.id }],
    }
    const r = createReversal(s1, state.entries, 1, "refund", id, at(20))
    state = { ...state, entries: [...state.entries, r] }
    const b = vendorBalance("v1", state, at(20))
    expect(b).toMatchObject({ paid_minor: 5000, payable_minor: -2000, pending_minor: 0, lifetime_minor: 3000 })
    // Next payout cannot be recorded because the vendor's payable balance is negative.
    expect(() => planPayout({ vendor_id: "v1", amount_minor: -2000 }, state, at(20))).toThrow(LedgerError)
  })

  it("only sales can be reversed", () => {
    const s = sale("v1", "o1", "l1", 1, 100)
    const r = createReversal(s, [s], 1, "refund", id, t0)
    expect(() => createReversal(r, [s, r], 1, "refund", id, t0)).toThrow(/only sale/)
    expect(() => createReversal(s, [s], 0, "refund", id, t0)).toThrow(LedgerError)
  })
})

describe("payouts", () => {
  const s1 = sale("v1", "o1", "l1", 1, 5000)
  const s2 = sale("v1", "o2", "l2", 2, 1000)
  const other = sale("v2", "o3", "l3", 1, 9999)
  const state: LedgerState = {
    entries: [s1, s2, other],
    deliveries: [delivered("o1", "v1", 0), delivered("o2", "v1", 0), delivered("o3", "v2", 0)],
    allocations: [],
  }

  it("covers all payable entries when the amount matches", () => {
    expect(planPayout({ vendor_id: "v1", amount_minor: 7000 }, state, at(15))).toEqual({ entry_ids: [s1.id, s2.id], amount_minor: 7000 })
  })

  it("rejects amount mismatches, other vendors' entries and non-payable entries", () => {
    expect(() => planPayout({ vendor_id: "v1", amount_minor: 7001 }, state, at(15))).toThrow(/does not match/)
    expect(() => planPayout({ vendor_id: "v1", amount_minor: 9999, entry_ids: [other.id] }, state, at(15))).toThrow(/another vendor/)
    expect(() => planPayout({ vendor_id: "v1", amount_minor: 7000 }, state, at(5))).toThrow(/nothing is payable/)
  })

  it("supports paying selected entries", () => {
    expect(planPayout({ vendor_id: "v1", amount_minor: 2000, entry_ids: [s2.id, s2.id] }, state, at(15))).toEqual({ entry_ids: [s2.id], amount_minor: 2000 })
  })

  it("reconciliation compares ledger paid totals with payouts", () => {
    const paid: LedgerState = { ...state, allocations: [{ payout_id: "p1", entry_id: s1.id }] }
    const payouts: Payout[] = [{ id: "p1", vendor_id: "v1", amount_minor: 5000, currency: "USD", paid_at: at(15), bank_reference: "REF1" }]
    expect(reconcile(["v1", "v2"], paid, payouts, at(15))).toEqual([
      { vendor_id: "v1", ledger_paid_minor: 5000, payouts_minor: 5000, difference_minor: 0, pending_minor: 0, payable_minor: 2000, ok: true },
      { vendor_id: "v2", ledger_paid_minor: 0, payouts_minor: 0, difference_minor: 0, pending_minor: 0, payable_minor: 9999, ok: true },
    ])
    const wrong = [{ ...payouts[0]!, amount_minor: 4000 }]
    expect(reconcile(["v1"], paid, wrong, at(15))[0]).toMatchObject({ ok: false, difference_minor: 1000 })
  })
})

describe("balance invariants under random refunds, returns and payouts", () => {
  type Op =
    | { kind: "sale"; qty: number; price: number }
    | { kind: "reverse"; pick: number; qty: number }
    | { kind: "deliver"; pick: number }
    | { kind: "payout" }
    | { kind: "advance"; days: number }

  const op: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ kind: fc.constant("sale" as const), qty: fc.integer({ min: 1, max: 4 }), price: fc.integer({ min: 1, max: 50_000 }) }),
    fc.record({ kind: fc.constant("reverse" as const), pick: fc.nat(), qty: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ kind: fc.constant("deliver" as const), pick: fc.nat() }),
    fc.record({ kind: fc.constant("payout" as const) }),
    fc.record({ kind: fc.constant("advance" as const), days: fc.integer({ min: 1, max: 20 }) }),
  )

  it("lifetime = pending + payable + paid, paid = payouts, and no line is reversed below zero", () => {
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        let day = 0
        let n = 0
        const newId = () => `x${++n}`
        const state: LedgerState = { entries: [], deliveries: [], allocations: [] }
        const payouts: Payout[] = []
        const sales: LedgerEntry[] = []
        for (const o of ops) {
          const now = at(day)
          if (o.kind === "sale") {
            const e = saleEntriesForOrder([{ order_id: `o${sales.length}`, order_line_id: `l${sales.length}`, vendor_id: "v", quantity: o.qty, vendor_price_minor: o.price, currency: "USD" }], [], newId, now)[0]!
            state.entries.push(e)
            sales.push(e)
          } else if (o.kind === "reverse" && sales.length) {
            const s = sales[o.pick % sales.length]!
            try {
              state.entries.push(createReversal(s, state.entries, o.qty, "return", newId, now))
            } catch (e) {
              expect((e as LedgerError).code).toBe("over_reversal")
            }
          } else if (o.kind === "deliver" && sales.length) {
            const s = sales[o.pick % sales.length]!
            if (!state.deliveries.some((d) => d.order_id === s.order_id)) state.deliveries.push(delivered(s.order_id, "v", day))
          } else if (o.kind === "payout") {
            const b = vendorBalance("v", state, now)
            if (b.payable_minor > 0) {
              const plan = planPayout({ vendor_id: "v", amount_minor: b.payable_minor }, state, now)
              const pid = newId()
              payouts.push({ id: pid, vendor_id: "v", amount_minor: plan.amount_minor, currency: "USD", paid_at: now, bank_reference: pid })
              for (const entry_id of plan.entry_ids) state.allocations.push({ payout_id: pid, entry_id })
            }
          } else if (o.kind === "advance") {
            day += o.days
          }
          const b = vendorBalance("v", state, at(day))
          expect(b.pending_minor + b.payable_minor + b.paid_minor).toBe(b.lifetime_minor)
          expect(b.lifetime_minor).toBeGreaterThanOrEqual(0)
          expect(reconcile(["v"], state, payouts, at(day))[0]!.ok).toBe(true)
          for (const s of sales) {
            const reversed = state.entries.filter((e) => e.reverses_entry_id === s.id).reduce((x, e) => x + e.quantity, 0)
            expect(reversed).toBeLessThanOrEqual(s.quantity)
          }
        }
      }),
      { numRuns: 300 },
    )
  })
})
