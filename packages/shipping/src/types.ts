export type StockLocation = "lagos" | "houston"

export interface ShippingCartLine {
  id: string
  quantity: number
  /** Unit retail price in USD major units. */
  unitPriceUsd: number
  location: StockLocation
  isPreorder: boolean
  /** Variant weight in kg; null/0/undefined falls back to settings.defaultWeightKg (Wix used `|| 1.5`). */
  weightKg?: number | null
}

export interface ShippingCart {
  lines: ShippingCartLine[]
  /** Checkout currency, e.g. "USD" or "CAD". */
  currency: string
}

export interface ShippingDestination {
  /** ISO 3166-1 alpha-2. */
  country: string
  /** State/province; bare ("AK") or ISO 3166-2 ("US-AK"). */
  subdivision?: string | null
  city?: string | null
  postalCode?: string | null
  addressLine1?: string | null
}

export interface UpsPackage {
  weightLbs: number
}

export interface UpsShopRequest {
  destination: ShippingDestination & { stateCode: string }
  packages: UpsPackage[]
}

export interface UpsRatedShipment {
  serviceCode: string
  /** Monetary value exactly as returned by UPS (a decimal string). */
  monetaryValue: string
  currency: string
}

export interface UpsRatingAdapter {
  /** Returns rated shipments; throws on any failure (network, auth, invalid response). */
  shop(request: UpsShopRequest): Promise<UpsRatedShipment[]>
}

export interface ExchangeRateAdapter {
  /** Units of `currency` per 1 USD (e.g. NGN → 1500, CAD → 1.37). Throws on failure. */
  usdTo(currency: string): Promise<number>
}

export interface ShippingAdapters {
  ups: UpsRatingAdapter
  fx: ExchangeRateAdapter
}

export type ShippingCarrier = "haanta" | "ups" | "dhl"
export type CartOrigin = "us" | "ng" | "mixed"

export interface ShippingOption {
  code: string
  title: string
  deliveryTime: string
  /** Price string exactly as the Wix code would have produced it. */
  price: string
  /** Numeric amount in `currency` major units. */
  amount: number
  currency: string
  carrier: ShippingCarrier
  meta: {
    origin: CartOrigin
    fezNgn?: number
    ngnPerUsd?: number
    upsSource?: "live" | "fallback" | "free"
  }
}

export interface ShippingQuote {
  options: ShippingOption[]
  origin: CartOrigin | null
  /** Variant line ids whose weight was missing and defaulted. */
  defaultedWeightLineIds: string[]
}
