import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { vi } from "vitest"
import { parseUpsRateResponse } from "../src/adapters/ups"
import type {
  ExchangeRateAdapter,
  ShippingCart,
  ShippingCartLine,
  UpsRatedShipment,
  UpsRatingAdapter,
  UpsShopRequest,
} from "../src/types"

const here = dirname(fileURLToPath(import.meta.url))

/** Recorded UPS Rating API responses (sanitised). */
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"))
}

export const upsUsShipments = (): UpsRatedShipment[] => parseUpsRateResponse(fixture("ups-shop-us.json"))
export const upsCaShipments = (): UpsRatedShipment[] => parseUpsRateResponse(fixture("ups-shop-ca.json"))

export function upsReturning(shipments: UpsRatedShipment[]) {
  const shop = vi.fn(async (_req: UpsShopRequest) => shipments)
  return { shop } satisfies UpsRatingAdapter
}

export function upsFailing() {
  const shop = vi.fn(async (_req: UpsShopRequest): Promise<UpsRatedShipment[]> => {
    throw new Error("UPS unavailable")
  })
  return { shop } satisfies UpsRatingAdapter
}

export function fxReturning(rates: Record<string, number>): ExchangeRateAdapter {
  return {
    usdTo: async (currency: string) => {
      const r = rates[currency]
      if (r === undefined) throw new Error(`no rate for ${currency}`)
      return r
    },
  }
}

export const fxFailing: ExchangeRateAdapter = {
  usdTo: async () => {
    throw new Error("fx down")
  },
}

export const fxHanging: ExchangeRateAdapter = { usdTo: () => new Promise<number>(() => {}) }

let n = 0
export function us(unitPriceUsd: number, extra: Partial<ShippingCartLine> = {}): ShippingCartLine {
  return { id: `us_${++n}`, quantity: 1, unitPriceUsd, location: "houston", isPreorder: false, weightKg: 1, ...extra }
}
export function ng(unitPriceUsd: number, extra: Partial<ShippingCartLine> = {}): ShippingCartLine {
  return { id: `ng_${++n}`, quantity: 1, unitPriceUsd, location: "lagos", isPreorder: false, weightKg: 1.5, ...extra }
}
export function cart(lines: ShippingCartLine[], currency = "USD"): ShippingCart {
  return { lines, currency }
}

export const MIXED_STD = "Standard Delivery (Shipping from US: 2-5 working days | Shipping from Nigeria: 10-21 days)"
export const MIXED_EXP =
  "DHL Expedited Shipping (Shipping from US: 2-3 working days | Shipping from Nigeria: 2-3 days)"
export const NG_STD = "Standard Delivery - Shipping from Nigeria (10-21 days)"
export const NG_EXP = "DHL Expedited Shipping - Shipping from Nigeria (2-3 days)"
export const US_STD = "Standard Delivery - Shipping from US (2-5 working days)"
