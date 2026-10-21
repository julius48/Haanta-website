/** Response shapes of the Haanta vendor API (docs/api.md). Never contains buyer personal data. */
import type { ListingSnapshot } from "./listing"

export type VendorStatus = "pending" | "active" | "paused" | "rejected"

export interface Me {
  user: { id: string; name: string; email: string; role: string; email_verified: boolean }
  vendor: { id: string; name: string; slug: string; status: VendorStatus; logo_url: string | null; banner_url: string | null; origin_country: string | null; region: string | null }
  mfa: { enrolled: boolean; verified: boolean }
}

export type ListingStatus = "draft" | "in_review" | "live" | "changes_requested"

export interface ListingView {
  id: string
  title: string
  /** First product photo, if any. */
  thumbnail: string | null
  status: ListingStatus
  product_id: string | null
  is_live: boolean
  has_pending_changes: boolean
  review_note: string | null
  submitted_at: string | null
  reviewed_at: string | null
  weight_missing: boolean
  size_chart_missing: boolean
  updated_at: string
}

export interface PricePreview {
  variant: string
  vendor_price_usd_minor: number
  retail: Record<string, number>
}

export interface ProductDetail {
  product: ListingView
  snapshot: ListingSnapshot | null
  approved_snapshot: ListingSnapshot | null
  prices: PricePreview[]
}

export interface SizeChartRow {
  label: string
  us?: string
  uk?: string
  eu?: string
  measurements: Record<string, string>
}

export interface SizeChart {
  id: string
  name: string
  unit: "in" | "cm"
  rows: SizeChartRow[]
  notes: string | null
}

export interface StorePage {
  name: string
  slug: string
  logo_url: string | null
  banner_url: string | null
  story: string | null
  policies: string | null
  size_notes: string | null
  region: string | null
  origin_country: string | null
  status: VendorStatus
}

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

export type VendorOrderStatus = "new" | "accepted" | "in_production" | "shipped_to_hub" | "received_at_hub" | "cancelled"

export interface VendorOrderLine {
  id: string
  product_title: string
  variant_title: string | null
  sku: string | null
  quantity: number
  vendor_price_minor: number
  line_total_minor: number
  options: Record<string, string>
  measurements: Record<string, string | number> | null
  fulfilment_type: string | null
  thumbnail: string | null
}

export interface VendorOrder {
  id: string
  display_id: string
  created_at: string
  status: VendorOrderStatus
  tracking_number: string | null
  tracking_carrier: string | null
  ship_to: HubAddress
  lines: VendorOrderLine[]
  total_minor: number
  ship_by: string | null
  is_late?: boolean
}

export type LedgerStatus = "pending" | "payable" | "paid"

export interface EarningsEntry {
  id: string
  created_at: string
  type: "sale" | "reversal"
  reason: string | null
  quantity: number
  amount_minor: number
  currency: string
  status: LedgerStatus
  payout_id: string | null
  order: string
  product: string
}

export interface Payout {
  id: string
  amount_minor: number
  currency: string
  paid_at: string
  bank_reference: string
}

export interface Earnings {
  balance: { pending_minor: number; payable_minor: number; paid_minor: number; lifetime_minor: number }
  entries: EarningsEntry[]
  payouts: Payout[]
}

export interface Analytics {
  days: number
  sales_by_day: { date: string; amount_minor: number }[]
  best_sellers: { product_id: string | null; title: string; units: number; earnings_minor: number }[]
  low_stock: { variant_id: string; product_id: string; title: string; available: number }[]
  open_orders: number
  late_orders: { id: string; display_id: string; ship_by: string; status: string }[]
  low_stock_threshold?: number
}
