/**
 * Order → vendor and ledger processing. Every operation is idempotent (safe to re-run from
 * subscribers, webhooks or scripts) because ledger rows carry unique business keys.
 */
import { randomBytes } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService, MedusaContainer } from "@medusajs/framework/types"
import { createReversal, LedgerError, planPayout, saleEntriesForOrder, type LedgerEntry, type ReversalReason } from "@haanta/core"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { LEDGER_MODULE, type LedgerService } from "../modules/ledger"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { AUDIT_MODULE, type AuditService } from "../modules/audit"
import { getMessenger } from "./adapters"
import { captureAlert } from "./monitoring"
import { buildVendorOrderViews } from "./vendor-orders"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }
const newId = () => `led_${randomBytes(12).toString("hex")}`
const DAY = 86_400_000

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "currency_code",
  "created_at",
  "metadata",
  "items.id",
  "items.variant_id",
  "items.product_id",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "items.detail.quantity",
  "items.unit_price",
  "items.metadata",
  "shipping_methods.name",
  "shipping_methods.data",
  "payment_collections.status",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.data",
  "payment_collections.payments.captured_at",
]

export async function loadOrder(container: MedusaContainer, orderId: string) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
  const order = data[0]
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  // Order line quantities live on the order item detail in Medusa v2.
  const items = ((order.items as Record<string, unknown>[] | undefined) ?? []).map(
    (it): Record<string, unknown> & { quantity: number } => ({
      ...it,
      quantity: Number((it.detail as { quantity?: unknown } | undefined)?.quantity ?? it.quantity),
    }),
  )
  for (const it of items) {
    if (!Number.isFinite(it.quantity) || !Number.isFinite(Number(it.unit_price))) throw new Error(`Order ${orderId} has an item without quantity or price`)
  }
  return { ...order, items } as Record<string, unknown> & { items: Record<string, unknown>[] }
}

function isPaid(order: Record<string, unknown>): boolean {
  const pcs = (order.payment_collections as { status?: string; payments?: { captured_at?: string | null }[] }[] | undefined) ?? []
  return pcs.some((pc) => pc.status === "completed" || (pc.payments ?? []).some((p) => !!p.captured_at))
}

function riskLevel(order: Record<string, unknown>): string | null {
  const pcs = (order.payment_collections as { payments?: { data?: Record<string, unknown> }[] }[] | undefined) ?? []
  for (const pc of pcs) for (const p of pc.payments ?? []) if (typeof p.data?.risk_level === "string") return p.data.risk_level
  return null
}

/**
 * Split a placed order into vendor parts and snapshot line prices. Creates ledger sale entries once
 * the order is paid. Safe to call repeatedly.
 */
export async function processOrder(container: MedusaContainer, orderId: string, opts: { notify?: boolean } = {}) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const settings = await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")
  const order = await loadOrder(container, orderId)
  const items = order.items ?? []
  const variantIds = items.map((i) => i.variant_id as string).filter(Boolean)
  const pricing = variantIds.length ? await marketplace.listVariantPricings({ variant_id: variantIds }, { take: null }) : []
  const productIds = [...new Set(pricing.map((p) => p.product_id))]
  const attrs = productIds.length ? await marketplace.listProductAttributes({ product_id: productIds }, { take: null }) : []
  const existingSnaps = await marketplace.listLinePriceSnapshots({ order_id: orderId }, { take: null })
  const currency = String(order.currency_code ?? "usd").toUpperCase()

  // 1. Price snapshots (immutable)
  const newSnaps: Record<string, unknown>[] = []
  for (const it of items) {
    if (existingSnaps.some((s) => s.line_item_id === it.id)) continue
    const p = pricing.find((x) => x.variant_id === it.variant_id)
    if (!p) continue
    const a = attrs.find((x) => x.product_id === p.product_id)
    newSnaps.push({
      order_id: orderId,
      line_item_id: it.id,
      variant_id: it.variant_id,
      product_id: p.product_id,
      vendor_id: p.vendor_id,
      product_title: it.product_title ?? null,
      variant_title: it.variant_title ?? null,
      fulfilment_type: p.fulfilment_type ?? a?.fulfilment_type ?? "ready_to_wear",
      quantity: Number(it.quantity),
      vendor_price_minor: p.vendor_price_minor,
      retail_price_minor: Math.round(Number(String(it.unit_price)) * 100),
      currency,
      markup_bps: p.markup_bps,
      markup_fixed_minor: p.markup_fixed_minor,
      markup_source: p.markup_source,
      stock_location: p.stock_location,
    })
  }
  if (newSnaps.length) await marketplace.createLinePriceSnapshots(newSnaps as never)
  const snaps = [...existingSnaps, ...(newSnaps as unknown as typeof existingSnaps)]

  // 2. Vendor orders (one per vendor), with ship-by dates from lead times
  const vendorIds = [...new Set(snaps.map((s) => s.vendor_id))]
  const existingVOs = await marketplace.listVendorOrders({ order_id: orderId }, { take: null })
  const createdVendorOrders: string[] = []
  for (const vendorId of vendorIds) {
    if (existingVOs.some((v) => v.vendor_id === vendorId)) continue
    const vendorSnaps = snaps.filter((s) => s.vendor_id === vendorId)
    const leadDays = Math.max(
      settings.vendorShipByDays,
      ...vendorSnaps.map((s) => {
        const a = attrs.find((x) => x.product_id === s.product_id)
        return s.fulfilment_type === "made_to_order" ? Number(a?.lead_time_days ?? settings.vendorShipByDays) : settings.vendorShipByDays
      }),
    )
    const isPreorder = vendorSnaps.some((s) => attrs.find((x) => x.product_id === s.product_id)?.is_preorder)
    const vo = await marketplace.createVendorOrders({
      order_id: orderId,
      display_id: String(order.display_id),
      vendor_id: vendorId,
      status: "new",
      ship_by: new Date(new Date(order.created_at as string).getTime() + leadDays * DAY),
      is_preorder: !!isPreorder,
    })
    createdVendorOrders.push(vo.id)
  }

  // 3. Ledger sale entries once paid
  let createdEntries = 0
  if (isPaid(order)) {
    const existing = await ledger.listLedgerEntries({ order_id: orderId }, { take: null })
    const entries = saleEntriesForOrder(
      snaps.map((s) => ({ order_id: orderId, order_line_id: s.line_item_id, vendor_id: s.vendor_id, quantity: Number(s.quantity), vendor_price_minor: Number(s.vendor_price_minor), currency: "USD" })),
      existing.map((e) => ({ order_line_id: e.order_line_id, type: e.type as "sale" | "reversal" })),
      newId,
      new Date(),
    )
    for (const e of entries) {
      try {
        await ledger.createLedgerEntries({ ...ledgerRow(e), idempotency_key: `sale:${e.order_line_id}` })
        createdEntries++
      } catch {
        // unique idempotency key: already created by a concurrent run
      }
    }
  }

  // 4. Radar review flag
  const risk = riskLevel(order)
  const meta = (order.metadata as Record<string, unknown> | null) ?? {}
  if (risk && settings.radarReviewRiskLevels.includes(risk as never) && !meta.haanta_risk_review) {
    await container.resolve<IOrderModuleService>(Modules.ORDER).updateOrders(orderId, { metadata: { ...meta, haanta_risk_review: true, haanta_risk_level: risk } })
    captureAlert("high_risk_order", { order_id: orderId, risk_level: risk })
  }

  // 5. Notifications (vendors get PII-free views; buyer gets the confirmation)
  if (opts.notify !== false && createdVendorOrders.length) {
    await notifyVendors(container, createdVendorOrders)
    if (typeof order.email === "string") {
      await getMessenger().send({
        event: "Order Placed",
        audience: "buyer",
        to: { email: order.email },
        properties: {
          order_number: order.display_id,
          items: items.map((i) => ({ title: i.product_title, variant: i.variant_title, quantity: i.quantity })),
          shipping: (order.shipping_methods as { name?: string }[] | undefined)?.[0]?.name ?? null,
          tracking_url: `${process.env.STOREFRONT_URL || "http://localhost:3000"}/track?order=${order.display_id}`,
        },
      })
    }
  }
  return { snapshots: newSnaps.length, vendor_orders: createdVendorOrders.length, ledger_entries: createdEntries, risk_level: risk }
}

function ledgerRow(e: LedgerEntry) {
  return {
    id: e.id,
    vendor_id: e.vendor_id,
    order_id: e.order_id,
    order_line_id: e.order_line_id,
    type: e.type,
    amount_minor: e.amount_minor,
    currency: e.currency,
    quantity: e.quantity,
    unit_vendor_price_minor: e.unit_vendor_price_minor,
    reverses_entry_id: e.reverses_entry_id,
    reason: e.reason,
  }
}

async function notifyVendors(container: MedusaContainer, vendorOrderIds: string[]) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const vos = await marketplace.listVendorOrders({ id: vendorOrderIds }, { take: null })
  for (const vo of vos) {
    const [view] = await buildVendorOrderViews(container, vo.vendor_id, [vo as unknown as Record<string, unknown>])
    const users = await marketplace.listVendorUsers({ vendor_id: vo.vendor_id })
    for (const u of users) {
      await getMessenger().send({ event: "Vendor New Order", audience: "vendor", to: { email: u.email }, properties: { order: view, portal_url: `${process.env.VENDOR_PORTAL_URL || "http://localhost:3001"}/orders/${vo.id}` } })
    }
  }
}

/**
 * Reverse vendor earnings for refunded, returned or cancelled units. `reference` makes the operation
 * idempotent (e.g. the refund id). Over-reversal is rejected.
 */
export async function reverseLines(
  container: MedusaContainer,
  orderId: string,
  lines: { line_item_id: string; quantity: number }[],
  reason: ReversalReason,
  reference: string,
) {
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const { state } = await ledger.loadState()
  const orderEntries = state.entries.filter((e) => e.order_id === orderId)
  const created: string[] = []
  for (const l of lines) {
    const key = `${reason}:${reference}:${l.line_item_id}`
    const [already] = await ledger.listLedgerEntries({ idempotency_key: key })
    if (already) continue
    const sale = orderEntries.find((e) => e.type === "sale" && e.order_line_id === l.line_item_id)
    if (!sale) continue // unpaid line: nothing owed to reverse
    const rev = createReversal(sale, orderEntries, l.quantity, reason, newId, new Date())
    await ledger.createLedgerEntries({ ...ledgerRow(rev), idempotency_key: key })
    orderEntries.push(rev)
    created.push(rev.id)
  }
  return created
}

/** Cancel everything still owed on an order (full cancellation). */
export async function reverseWholeOrder(container: MedusaContainer, orderId: string, reason: ReversalReason, reference: string) {
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const { state } = await ledger.loadState()
  const entries = state.entries.filter((e) => e.order_id === orderId)
  const lines = entries
    .filter((e) => e.type === "sale")
    .map((s) => ({ line_item_id: s.order_line_id, quantity: s.quantity - entries.filter((r) => r.reverses_entry_id === s.id).reduce((n, r) => n + r.quantity, 0) }))
    .filter((l) => l.quantity > 0)
  const created = await reverseLines(container, orderId, lines, reason, reference)
  const vos = await marketplace.listVendorOrders({ order_id: orderId }, { take: null })
  for (const vo of vos) if (vo.status !== "cancelled") await marketplace.updateVendorOrders({ id: vo.id, status: "cancelled" })
  return created
}

/** Record delivery (per vendor part) so earnings become payable after the return window. */
export async function recordDelivery(container: MedusaContainer, orderId: string, deliveredAt: Date, vendorId?: string) {
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const window = (await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")).returnWindowDays
  const vos = await marketplace.listVendorOrders({ order_id: orderId, ...(vendorId ? { vendor_id: vendorId } : {}) }, { take: null })
  const existing = await ledger.listDeliveryRecords({ order_id: orderId }, { take: null })
  const created: string[] = []
  for (const vo of vos) {
    if (existing.some((d) => d.vendor_id === vo.vendor_id)) continue
    const d = await ledger.createDeliveryRecords({ order_id: orderId, vendor_id: vo.vendor_id, delivered_at: deliveredAt, return_window_days: window })
    created.push(d.id)
  }
  return created
}

export interface RecordPayoutInput {
  vendor_id: string
  amount_minor: number
  paid_at: Date
  bank_reference: string
  entry_ids?: string[]
  note?: string
}

/** Manual payout: validate against payable entries, write payout + allocations, email the statement. */
export async function recordPayout(container: MedusaContainer, input: RecordPayoutInput, actorId: string) {
  const ledger = container.resolve<LedgerService>(LEDGER_MODULE)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [vendor] = await marketplace.listVendors({ id: input.vendor_id })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const { state } = await ledger.loadState(input.vendor_id)
  let plan
  try {
    plan = planPayout({ vendor_id: input.vendor_id, amount_minor: input.amount_minor, entry_ids: input.entry_ids }, state, new Date())
  } catch (e) {
    if (e instanceof LedgerError) throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
    throw e
  }
  const payout = await ledger.createPayouts({
    vendor_id: input.vendor_id,
    amount_minor: plan.amount_minor,
    currency: "USD",
    paid_at: input.paid_at,
    bank_reference: input.bank_reference,
    recorded_by: actorId,
    note: input.note ?? null,
  })
  await ledger.createPayoutAllocations(plan.entry_ids.map((entry_id) => ({ payout_id: payout.id, entry_id })))
  await container.resolve<AuditService>(AUDIT_MODULE).record({
    actor_type: "user",
    actor_id: actorId,
    action: "payout.recorded",
    entity_type: "payout",
    entity_id: payout.id,
    after: { vendor_id: input.vendor_id, amount_minor: plan.amount_minor, bank_reference: input.bank_reference, entries: plan.entry_ids.length },
  })
  const users = await marketplace.listVendorUsers({ vendor_id: input.vendor_id })
  for (const u of users) {
    await getMessenger().send({
      event: "Vendor Payout Sent",
      audience: "vendor",
      to: { email: u.email },
      properties: {
        payout_id: payout.id,
        amount: (plan.amount_minor / 100).toFixed(2),
        currency: "USD",
        paid_at: input.paid_at.toISOString().slice(0, 10),
        bank_reference: input.bank_reference,
        statement_pdf_url: `${process.env.VENDOR_PORTAL_URL || "http://localhost:3001"}/earnings/statements/${payout.id}?format=pdf`,
        statement_csv_url: `${process.env.VENDOR_PORTAL_URL || "http://localhost:3001"}/earnings/statements/${payout.id}?format=csv`,
      },
    })
  }
  return { payout, entry_ids: plan.entry_ids }
}
