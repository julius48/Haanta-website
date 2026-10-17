/**
 * Refunds and returns by line: refund the buyer (payment provider) for the retail amount of the
 * units, then append reversing ledger entries so the vendor is not paid for them.
 */
import { randomBytes } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { LedgerError, type ReversalReason } from "@haanta/core"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { LEDGER_MODULE, type LedgerService } from "../modules/ledger"
import { getMessenger } from "./adapters"
import { reverseLines } from "./ledger-ops"
import { captureAlert } from "./monitoring"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

export async function refundLines(
  container: MedusaContainer,
  orderId: string,
  lines: { line_item_id: string; quantity: number }[],
  reason: ReversalReason,
  actorId: string,
) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const snaps = await marketplace.listLinePriceSnapshots({ order_id: orderId }, { take: null })
  let amountMinor = 0
  for (const l of lines) {
    const s = snaps.find((x) => x.line_item_id === l.line_item_id)
    if (!s) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Line ${l.line_item_id} is not on this order`)
    if (l.quantity > Number(s.quantity)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Refund quantity exceeds the quantity ordered")
    amountMinor += Number(s.retail_price_minor) * l.quantity
  }
  const { data } = await query.graph({ entity: "order", fields: ["id", "display_id", "email", "currency_code", "payment_collections.payments.id", "payment_collections.payments.captured_at"], filters: { id: orderId } })
  const order = data[0]
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  const payment = ((order.payment_collections as { payments?: { id: string; captured_at?: string | null }[] }[] | undefined) ?? []).flatMap((pc) => pc.payments ?? []).find((p) => p.captured_at)
  if (!payment) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order has no captured payment to refund")

  // Check remaining (not yet refunded) quantities BEFORE moving any money.
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const entries = await ledger.listLedgerEntries({ order_id: orderId }, { take: null })
  for (const l of lines) {
    const sale = entries.find((e) => e.type === "sale" && e.order_line_id === l.line_item_id)
    if (!sale) continue
    const reversed = entries.filter((e) => e.reverses_entry_id === sale.id).reduce((n, e) => n + Number(e.quantity), 0)
    if (l.quantity > Number(sale.quantity) - reversed) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Those units have already been refunded")
  }
  const reference = `ref_${randomBytes(8).toString("hex")}`
  try {
    await refundPaymentWorkflow(container).run({ input: { payment_id: payment.id, amount: amountMinor / 100, created_by: actorId } })
  } catch (e) {
    captureAlert("payment_failed", { stage: "refund", order_id: orderId, error: (e as Error).message })
    throw e
  }
  let reversed: string[]
  try {
    reversed = await reverseLines(container, orderId, lines, reason, reference)
  } catch (e) {
    if (e instanceof LedgerError) throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
    throw e
  }
  if (typeof order.email === "string") {
    await getMessenger().send({ event: "Refund Issued", audience: "buyer", to: { email: order.email }, properties: { order_number: order.display_id, amount: (amountMinor / 100).toFixed(2), currency: String(order.currency_code).toUpperCase() } })
  }
  return { refunded_minor: amountMinor, reversal_entries: reversed, reference }
}
