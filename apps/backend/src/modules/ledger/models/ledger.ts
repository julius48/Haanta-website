import { model } from "@medusajs/framework/utils"

/** All four tables are append-only; UPDATE and DELETE are blocked by database triggers (see migrations). */
export const LedgerEntryModel = model
  .define("ledger_entry", {
    id: model.id({ prefix: "led" }).primaryKey(),
    vendor_id: model.text(),
    order_id: model.text(),
    order_line_id: model.text(),
    type: model.enum(["sale", "reversal"]),
    amount_minor: model.number(),
    currency: model.text(),
    quantity: model.number(),
    unit_vendor_price_minor: model.number(),
    reverses_entry_id: model.text().nullable(),
    reason: model.enum(["refund", "cancellation", "return"]).nullable(),
    /** Business key for idempotency, e.g. "sale:<line_id>" or "refund:<refund_id>:<line_id>". */
    idempotency_key: model.text().unique(),
  })
  .indexes([{ on: ["vendor_id"] }, { on: ["order_id"] }])

export const DeliveryRecordModel = model
  .define("delivery_record", {
    id: model.id({ prefix: "dlv" }).primaryKey(),
    order_id: model.text(),
    vendor_id: model.text(),
    delivered_at: model.dateTime(),
    return_window_days: model.number(),
  })
  .indexes([{ on: ["order_id", "vendor_id"], unique: true }])

export const PayoutModel = model
  .define("payout", {
    id: model.id({ prefix: "pay" }).primaryKey(),
    vendor_id: model.text(),
    amount_minor: model.number(),
    currency: model.text(),
    paid_at: model.dateTime(),
    bank_reference: model.text(),
    recorded_by: model.text(),
    note: model.text().nullable(),
  })
  .indexes([{ on: ["vendor_id"] }])

export const PayoutAllocationModel = model
  .define("payout_allocation", {
    id: model.id({ prefix: "palloc" }).primaryKey(),
    payout_id: model.text(),
    entry_id: model.text().unique(),
  })
  .indexes([{ on: ["payout_id"] }])
