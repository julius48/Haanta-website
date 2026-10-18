/**
 * Shapes returned by the Haanta backend (docs/api.md). Medusa store amounts are MAJOR units
 * (68 = $68.00); Haanta `*_minor` fields are integer cents.
 */

export type ShipsFrom = "lagos" | "houston"
export type Fulfilment = "ready_to_wear" | "made_to_order" | "preorder"
export type SortKey = "relevance" | "newest" | "price_asc" | "price_desc" | "best_selling"
export type BadgeKind = "new" | "preorder" | "made_to_order" | "sale"
export type CountryCode = "us" | "ca" | "mx"

export interface SearchDocument {
  id: string
  handle: string
  title: string
  description: string
  thumbnail: string | null
  images?: string[]
  vendor: { id: string; name: string; slug: string; region: string | null }
  categories: string[]
  category_names: string[]
  styles: string[]
  shops: string[]
  merch: string[]
  sizes: string[]
  colors: string[]
  price_usd: number
  price_cad: number
  compare_at_usd: number | null
  on_sale: boolean
  ships_from: ShipsFrom[]
  fulfilment: "ready_to_wear" | "made_to_order"
  is_preorder: boolean
  in_stock: boolean
  is_new: boolean
  created_at: string
  units_sold: number
}

export interface FacetValue {
  value: string
  count: number
}

export type FacetName = "category" | "brand" | "style" | "region" | "size" | "color" | "ships_from" | "fulfilment"

export interface SearchResult {
  hits: SearchDocument[]
  total: number
  page: number
  pages: number
  facets: Partial<Record<FacetName, FacetValue[]>>
  price_range: { min: number; max: number }
}

export interface BrandSummary {
  id: string
  name: string
  slug: string
  logo_url: string | null
  region: string | null
  origin_country: string | null
}

export interface BrandDetail {
  brand: {
    id: string
    name: string
    slug: string
    logo_url: string | null
    banner_url: string | null
    /** Sanitised HTML from the backend. */
    story: string | null
    region: string | null
    origin_country: string | null
    size_notes: string | null
    policies: string | null
  }
  products: SearchDocument[]
  total: number
}

export interface RequiredMeasurement {
  key: string
  label: string
  min: number
  max: number
  unit: string
}

export interface SizeChartRow {
  label: string
  us?: string
  uk?: string
  eu?: string
  measurements?: Record<string, string>
}

export interface ReviewItem {
  id: string
  rating: number
  title: string | null
  body: string
  fit: "runs_small" | "true_to_size" | "runs_large" | null
  photos: string[]
  display_name: string
  verified_purchase: boolean
  created_at: string
}

export interface ProductExtras {
  product_id: string
  vendor: { id: string; name: string; slug: string; region: string | null; size_notes: string | null; logo_url: string | null }
  fulfilment_type: "ready_to_wear" | "made_to_order"
  lead_time_days: number | null
  is_preorder: boolean
  fit_notes: string | null
  required_measurements: RequiredMeasurement[]
  size_chart: { name: string; unit: string; rows: SizeChartRow[]; notes?: string | null } | null
  ships_from: ShipsFrom[]
  variants: { variant_id: string; ships_from: ShipsFrom; fulfilment_type: string }[]
  delivery_estimate: string
  badges: BadgeKind[]
  material: string | null
  care: string | null
  reviews: {
    average: number | null
    count: number
    fit: { runs_small: number; true_to_size: number; runs_large: number }
    items: ReviewItem[]
  }
  complete_the_look: SearchDocument[]
}

export interface CalculatedPrice {
  calculated_amount: number | null
  original_amount: number | null
  currency_code: string
}

export interface StoreVariant {
  id: string
  title: string | null
  sku?: string | null
  options?: { id: string; value: string; option_id?: string | null; option?: { id: string; title: string } | null }[] | null
  calculated_price?: CalculatedPrice | null
}

export interface StoreProduct {
  id: string
  title: string
  handle: string
  subtitle: string | null
  description: string | null
  thumbnail: string | null
  images?: { id: string; url: string }[] | null
  options?: { id: string; title: string; values?: { id: string; value: string }[] | null }[] | null
  variants?: StoreVariant[] | null
  categories?: { id: string; name: string; handle: string }[] | null
}

export interface Region {
  id: string
  name: string
  currency_code: string
  countries?: { iso_2: string }[]
}

export interface Address {
  id?: string
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
}

export interface LineItem {
  id: string
  title: string
  product_title?: string | null
  product_handle?: string | null
  variant_title?: string | null
  variant_id?: string | null
  product_id?: string | null
  thumbnail: string | null
  quantity: number
  unit_price: number
  subtotal?: number | null
  total?: number | null
  metadata?: { measurements?: Record<string, number | string> } | null
}

export interface Cart {
  id: string
  email?: string | null
  currency_code: string
  region_id?: string | null
  items?: LineItem[]
  subtotal?: number
  item_subtotal?: number
  item_total?: number
  total?: number
  tax_total?: number
  discount_total?: number
  shipping_total?: number
  shipping_address?: Address | null
  promotions?: { id: string; code?: string | null; is_automatic?: boolean | null }[]
  shipping_methods?: { id: string; name: string; amount: number }[]
  completed_at?: string | null
  payment_collection?: {
    id: string
    payment_sessions?: { id: string; provider_id: string; data?: Record<string, unknown> | null; status?: string }[]
  } | null
}

export interface Settings {
  newsletter_popup: { enabled: boolean; delaySeconds: number; frequencyDays: number; showOnMobile: boolean }
  duties_message: string
  ready_to_wear_dispatch: string
  free_shipping_threshold_usd: number
  return_window_days: number
}

export interface ShippingQuoteOption {
  code: string
  title: string
  delivery_time: string
  amount: number
  currency: string
  carrier: string
}

export interface ShippingQuote {
  shipping_option_id: string
  origin: "us" | "ng" | "mixed" | null
  currency: string
  duties_message: string
  options: ShippingQuoteOption[]
}

export interface Customer {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone?: string | null
  addresses?: (Address & { id: string })[]
}

export interface Order {
  id: string
  display_id: number
  email?: string | null
  status: string
  created_at: string
  currency_code: string
  total: number
  subtotal?: number
  item_total?: number
  shipping_total?: number
  tax_total?: number
  discount_total?: number
  fulfillment_status?: string
  payment_status?: string
  items?: LineItem[]
  shipping_address?: Address | null
}

export interface TrackingResult {
  order_number: number
  status: string
  placed_at: string
  stages: { stage: string; is_preorder: boolean; estimated_dispatch: string | null }[]
  shipments: {
    tracking_number: string
    shipped_at?: string | null
    delivered_at?: string | null
    events: { status?: string; description?: string; location?: string; occurred_at?: string; timestamp?: string }[]
  }[]
}

/** Server action result shape shared by forms. */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "ok"; message?: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
