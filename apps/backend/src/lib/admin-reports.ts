/** Read models for the Haanta admin dashboard. Buyer emails are masked in every list. */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { maskEmail } from "@haanta/core"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { pricingRates } from "./pricing"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[]; metadata?: { count?: number } }> }
const DAY = 86_400_000
const startOfDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

function cartValue(c: Record<string, unknown>): number {
  return ((c.items as { unit_price: number; quantity: number }[] | undefined) ?? []).reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity), 0)
}

export async function dashboard(container: MedusaContainer, days: number) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const since = new Date(Date.now() - days * DAY)
  const today = startOfDay()
  const rates = await pricingRates()
  const toUsd = (amount: number, currency: string) => (currency.toUpperCase() === "USD" ? amount : amount / (rates[currency.toUpperCase()] ?? 1))

  const [{ data: orders }, { data: carts }] = await Promise.all([
    query.graph({ entity: "order", fields: ["id", "created_at", "total", "currency_code", "status"], filters: { created_at: { $gte: since } } }),
    query.graph({
      entity: "cart",
      fields: ["id", "created_at", "updated_at", "completed_at", "email", "currency_code", "items.unit_price", "items.quantity", "shipping_methods.id", "payment_collection.id"],
      filters: { created_at: { $gte: since } },
    }),
  ])
  const live = orders.filter((o) => o.status !== "canceled")
  const todays = live.filter((o) => new Date(o.created_at as string) >= today)
  const salesUsd = (list: Record<string, unknown>[]) => list.reduce((n, o) => n + toUsd(Number(o.total), String(o.currency_code)), 0)
  const cartsToday = carts.filter((c) => new Date(c.created_at as string) >= today)

  const series = new Map<string, { date: string; sales_usd: number; orders: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY).toISOString().slice(0, 10)
    series.set(d, { date: d, sales_usd: 0, orders: 0 })
  }
  for (const o of live) {
    const d = String(o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at).slice(0, 10)
    const row = series.get(d)
    if (row) {
      row.sales_usd += toUsd(Number(o.total), String(o.currency_code))
      row.orders++
    }
  }
  const withItems = carts.filter((c) => ((c.items as unknown[] | undefined) ?? []).length > 0)
  const abandoned = withItems.filter((c) => c.email && !c.completed_at && Date.now() - new Date(c.updated_at as string).getTime() > 3600_000)
  return {
    today: {
      sales_usd: round2(salesUsd(todays)),
      orders: todays.length,
      average_order_value_usd: todays.length ? round2(salesUsd(todays) / todays.length) : 0,
      conversion_rate: cartsToday.length ? round4(todays.length / cartsToday.length) : 0,
      // Active carts in the last 5 minutes. PostHog live visitors appear when POSTHOG_PERSONAL_API_KEY is set.
      live_visitors: carts.filter((c) => Date.now() - new Date(c.updated_at as string).getTime() < 5 * 60_000).length,
    },
    period: { days, sales_usd: round2(salesUsd(live)), orders: live.length, series: [...series.values()].map((r) => ({ ...r, sales_usd: round2(r.sales_usd) })) },
    funnel: {
      carts: carts.length,
      with_items: withItems.length,
      with_email: withItems.filter((c) => !!c.email).length,
      with_shipping: withItems.filter((c) => ((c.shipping_methods as unknown[] | undefined) ?? []).length > 0).length,
      at_payment: withItems.filter((c) => !!c.payment_collection).length,
      completed: carts.filter((c) => !!c.completed_at).length,
    },
    abandoned_carts: { count: abandoned.length, value_usd: round2(abandoned.reduce((n, c) => n + toUsd(cartValue(c), String(c.currency_code)), 0)) },
  }
}

export async function abandonedCarts(container: MedusaContainer, days = 14) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "updated_at", "completed_at", "email", "currency_code", "items.product_title", "items.quantity", "items.unit_price"],
    filters: { created_at: { $gte: new Date(Date.now() - days * DAY) } },
  })
  return data
    .filter((c) => c.email && !c.completed_at && ((c.items as unknown[] | undefined) ?? []).length && Date.now() - new Date(c.updated_at as string).getTime() > 3600_000)
    .map((c) => ({
      id: c.id,
      email: maskEmail(String(c.email)),
      last_activity: c.updated_at,
      currency: c.currency_code,
      value: round2(cartValue(c)),
      items: ((c.items as { product_title: string; quantity: number }[]) ?? []).map((i) => ({ title: i.product_title, quantity: Number(i.quantity) })),
    }))
}

export async function adminOrders(container: MedusaContainer, opts: { limit: number; offset: number; origin?: string; risk?: string }) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const { data, metadata } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "created_at", "email", "status", "total", "currency_code", "metadata", "shipping_methods.name", "shipping_methods.data", "payment_status", "fulfillment_status"],
    pagination: { skip: opts.offset, take: opts.limit, order: { created_at: "DESC" } },
  })
  const ids = data.map((o) => o.id as string)
  const [snaps, vendorOrders, vendors] = ids.length
    ? await Promise.all([
        marketplace.listLinePriceSnapshots({ order_id: ids }, { take: null }),
        marketplace.listVendorOrders({ order_id: ids }, { take: null }),
        marketplace.listVendors({}, { take: null }),
      ])
    : [[], [], []]
  const rows = data.map((o) => {
    const locs = new Set(snaps.filter((s) => s.order_id === o.id).map((s) => s.stock_location))
    const origin = locs.size === 2 ? "mixed" : locs.has("houston") ? "us" : locs.has("lagos") ? "ng" : null
    const meta = (o.metadata as Record<string, unknown> | null) ?? {}
    return {
      id: o.id,
      display_id: o.display_id,
      created_at: o.created_at,
      email: maskEmail(String(o.email ?? "")),
      status: o.status,
      total: Number(o.total),
      currency: o.currency_code,
      origin,
      shipping_option: (o.shipping_methods as { name?: string; data?: { quote_code?: string } }[] | undefined)?.map((m) => m.data?.quote_code ?? m.name) ?? [],
      risk_review: !!meta.haanta_risk_review,
      risk_level: meta.haanta_risk_level ?? null,
      vendors: vendorOrders
        .filter((v) => v.order_id === o.id)
        .map((v) => ({ vendor: vendors.find((x) => x.id === v.vendor_id)?.name ?? v.vendor_id, status: v.status, tracking_number: v.tracking_number, tracking_carrier: v.tracking_carrier, ship_by: v.ship_by })),
    }
  })
  const filtered = rows.filter((r) => (!opts.origin || r.origin === opts.origin) && (!opts.risk || r.risk_review))
  return { orders: filtered, count: metadata?.count ?? filtered.length }
}

export async function catalogHealth(container: MedusaContainer) {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const threshold = (await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")).lowStockThreshold
  const [listings, attrs, snaps] = await Promise.all([
    marketplace.listProductListings({ status: ["live", "in_review", "changes_requested"] }, { take: null }),
    marketplace.listProductAttributes({}, { take: null }),
    marketplace.listLinePriceSnapshots({ created_at: { $gte: new Date(Date.now() - 60 * DAY) } } as never, { take: null }),
  ])
  const live = listings.filter((l) => l.product_id && l.approved_snapshot)
  const units = new Map<string, number>()
  for (const s of snaps) if (s.product_id) units.set(s.product_id, (units.get(s.product_id) ?? 0) + Number(s.quantity))
  const title = (pid: string) => live.find((l) => l.product_id === pid)?.title ?? pid
  const { data: variants } = live.length
    ? await query.graph({
        entity: "product_variant",
        fields: ["id", "title", "product_id", "manage_inventory", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
        filters: { product_id: live.map((l) => l.product_id!) },
      })
    : { data: [] as Record<string, unknown>[] }
  const stock = variants
    .filter((v) => v.manage_inventory)
    .map((v) => {
      const levels = ((v.inventory_items as { inventory?: { location_levels?: { stocked_quantity: number; reserved_quantity: number }[] } }[] | undefined) ?? []).flatMap((i) => i.inventory?.location_levels ?? [])
      return { variant_id: v.id, product_id: v.product_id as string, title: `${title(v.product_id as string)} – ${v.title}`, available: levels.reduce((n, l) => n + Number(l.stocked_quantity) - Number(l.reserved_quantity), 0) }
    })
  return {
    top_sellers: [...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([product_id, u]) => ({ product_id, title: title(product_id), units_60d: u })),
    no_sales_60d: live.filter((l) => !units.has(l.product_id!)).map((l) => ({ product_id: l.product_id, title: l.title })),
    out_of_stock: stock.filter((s) => s.available <= 0),
    low_stock: stock.filter((s) => s.available > 0 && s.available <= threshold),
    missing_weight: attrs.filter((a) => a.weight_missing).map((a) => ({ product_id: a.product_id, title: title(a.product_id) })),
    missing_size_chart: attrs.filter((a) => !a.size_chart_id).map((a) => ({ product_id: a.product_id, title: title(a.product_id) })),
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10_000) / 10_000
