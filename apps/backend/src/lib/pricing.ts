/** Server-side pricing: the only place retail prices are computed. Clients never send prices. */
import type { MedusaContainer } from "@medusajs/framework/types"
import { priceVariant, type FxRates, type MarkupRule, type VariantPrice } from "@haanta/pricing"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { getShippingAdapters } from "./adapters"

const FALLBACK_RATES: FxRates = { NGN: 1500, CAD: 1.37 }

/** FX rates for pricing. Cached by the adapter; falls back to configured rates if the lookup fails. */
export async function pricingRates(): Promise<FxRates> {
  const fx = getShippingAdapters().fx
  const get = async (c: string) => {
    try {
      return await Promise.race([fx.usdTo(c), new Promise<number>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))])
    } catch {
      return FALLBACK_RATES[c]!
    }
  }
  const [NGN, CAD] = await Promise.all([get("NGN"), get("CAD")])
  return { NGN, CAD }
}

const rule = (bps: number | null | undefined, fixed: number | null | undefined): MarkupRule | null =>
  bps == null ? null : { percentBps: Number(bps), fixedMinor: Number(fixed ?? 0) }

export interface PriceInput {
  vendor_id: string
  product_id?: string | null
  category_ids: string[]
  vendor_price_minor: number
  vendor_currency: string
}

export async function computePrices(container: MedusaContainer, inputs: PriceInput[], rates?: FxRates): Promise<VariantPrice[]> {
  if (!inputs.length) return []
  const settings = await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("pricing")
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const fx = rates ?? (await pricingRates())
  const vendorIds = [...new Set(inputs.map((i) => i.vendor_id))]
  const productIds = [...new Set(inputs.map((i) => i.product_id).filter((x): x is string => !!x))]
  const categoryIds = [...new Set(inputs.flatMap((i) => i.category_ids))]
  const [vendors, attrs, cats] = await Promise.all([
    marketplace.listVendors({ id: vendorIds }),
    productIds.length ? marketplace.listProductAttributes({ product_id: productIds }) : Promise.resolve([]),
    categoryIds.length ? marketplace.listCategoryMarkups({ category_id: categoryIds }) : Promise.resolve([]),
  ])
  return inputs.map((i) => {
    const vendor = vendors.find((v) => v.id === i.vendor_id)
    const attr = attrs.find((a) => a.product_id === i.product_id)
    return priceVariant({
      vendorPrice: { amountMinor: i.vendor_price_minor, currency: i.vendor_currency },
      overrides: {
        product: rule(attr?.markup_bps, attr?.markup_fixed_minor),
        categories: i.category_ids.map((c) => {
          const m = cats.find((x) => x.category_id === c)
          return m ? rule(m.markup_bps, m.markup_fixed_minor) : null
        }),
        vendor: rule(vendor?.markup_bps, vendor?.markup_fixed_minor),
      },
      settings,
      rates: fx,
    })
  })
}
