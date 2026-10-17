/**
 * Vendor-safe projections. Vendors must never receive a buyer's name, email, phone or address from
 * any endpoint, webhook, email or export. Every vendor-facing payload is built through these
 * allow-list functions (never by deleting fields from a full object).
 */

export interface HubAddress {
  name: string
  address_1: string
  address_2?: string | null
  city: string
  province: string
  postal_code: string
  country_code: string
  phone?: string | null
}

export interface MeasurementSet {
  [field: string]: string | number
}

export interface VendorOrderLineSource {
  id: string
  product_title: string
  variant_title?: string | null
  sku?: string | null
  quantity: number
  vendor_price_minor: number
  options?: Record<string, string> | null
  measurements?: MeasurementSet | null
  fulfilment_type?: string | null
  thumbnail?: string | null
}

export interface VendorOrderSource {
  id: string
  display_id: number | string
  created_at: string | Date
  vendor_status: string
  tracking_number?: string | null
  tracking_carrier?: string | null
  is_preorder?: boolean
  lines: VendorOrderLineSource[]
  // Anything else on the source (customer, email, shipping_address …) is ignored by design.
  [key: string]: unknown
}

export interface VendorOrderView {
  id: string
  display_id: string
  created_at: string
  status: string
  tracking_number: string | null
  tracking_carrier: string | null
  ship_to: HubAddress
  lines: {
    id: string
    product_title: string
    variant_title: string | null
    sku: string | null
    quantity: number
    vendor_price_minor: number
    line_total_minor: number
    options: Record<string, string>
    measurements: MeasurementSet | null
    fulfilment_type: string | null
    thumbnail: string | null
  }[]
  total_minor: number
}

const MEASUREMENT_KEY = /^[a-z][a-z0-9_ ]{0,40}$/i

function cleanMeasurements(m: MeasurementSet | null | undefined): MeasurementSet | null {
  if (!m) return null
  const out: MeasurementSet = {}
  for (const [k, v] of Object.entries(m)) {
    if (!MEASUREMENT_KEY.test(k)) continue
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (typeof v === "string" && v.length <= 40) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

export function toVendorOrderView(order: VendorOrderSource, hub: HubAddress): VendorOrderView {
  const lines = order.lines.map((l) => ({
    id: l.id,
    product_title: l.product_title,
    variant_title: l.variant_title ?? null,
    sku: l.sku ?? null,
    quantity: l.quantity,
    vendor_price_minor: l.vendor_price_minor,
    line_total_minor: l.vendor_price_minor * l.quantity,
    options: { ...(l.options ?? {}) },
    measurements: cleanMeasurements(l.measurements),
    fulfilment_type: l.fulfilment_type ?? null,
    thumbnail: l.thumbnail ?? null,
  }))
  return {
    id: order.id,
    display_id: String(order.display_id),
    created_at: new Date(order.created_at).toISOString(),
    status: order.vendor_status,
    tracking_number: order.tracking_number ?? null,
    tracking_carrier: order.tracking_carrier ?? null,
    ship_to: { ...hub },
    lines,
    total_minor: lines.reduce((s, l) => s + l.line_total_minor, 0),
  }
}

/**
 * Defence in depth: throws if a vendor payload contains anything that looks like buyer PII.
 * Used by the vendor API response guard and in tests.
 */
export function assertNoBuyerPii(payload: unknown, buyer: { email?: string | null; names?: string[]; phone?: string | null; address_lines?: string[] }): void {
  const json = JSON.stringify(payload).toLowerCase()
  const needles = [buyer.email, buyer.phone, ...(buyer.names ?? []), ...(buyer.address_lines ?? [])]
    .filter((s): s is string => !!s && s.trim().length >= 3)
    .map((s) => s.toLowerCase())
  for (const n of needles) {
    if (json.includes(n)) throw new Error("Buyer personal data found in vendor payload")
  }
  // Key-name check skips `ship_to` (Haanta's own hub address); buyer values above are checked everywhere.
  const keys = JSON.stringify(payload, (k, v) => (k === "ship_to" ? undefined : v)).toLowerCase()
  for (const key of ['"email"', '"phone"', '"first_name"', '"last_name"', '"shipping_address"', '"billing_address"', '"customer"']) {
    if (keys.includes(key)) throw new Error(`Forbidden field ${key} in vendor payload`)
  }
}
