/**
 * Builds the shipping engine input from a cart using server-side data only (variant origin,
 * pre-order flag and weight come from Haanta's pricing/attribute tables, never from the client),
 * runs quoteShipping and stores the quote for the fulfilment provider.
 */
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { quoteShipping, resolveShippingSettings, type ShippingCartLine } from "@haanta/shipping"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../modules/haanta-settings"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { getShippingAdapters } from "./adapters"
import { pricingRates } from "./pricing"
import { cartFingerprint, loadQuote, saveQuote, type StoredQuote } from "./quote-store"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

const CART_FIELDS = [
  "id",
  "currency_code",
  "region_id",
  "items.id",
  "items.variant_id",
  "items.quantity",
  "items.unit_price",
  "shipping_address.country_code",
  "shipping_address.province",
  "shipping_address.postal_code",
  "shipping_address.city",
  "shipping_address.address_1",
]

export interface CartQuote extends StoredQuote {
  shipping_option_id: string | null
  cached: boolean
}

export async function quoteForCart(container: MedusaContainer, cartId: string): Promise<CartQuote> {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } })
  const cart = data[0] as
    | { id: string; currency_code: string; items?: { variant_id: string; quantity: number; unit_price: number }[]; shipping_address?: Record<string, string | null> | null }
    | undefined
  if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  const address = cart.shipping_address
  if (!address?.country_code) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add a shipping address first")
  const items = cart.items ?? []
  const currency = cart.currency_code.toUpperCase()
  const fingerprint = cartFingerprint({ items, address, currency })
  const shippingOptionId = await haantaOptionFor(container, address.country_code)

  const settingsService = container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE)
  const general = await settingsService.getSettings("general")
  const cached = await loadQuote(cart.id)
  if (cached && cached.fingerprint === fingerprint) return { ...cached, shipping_option_id: shippingOptionId, cached: true }

  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const variantIds = items.map((i) => i.variant_id).filter(Boolean)
  const pricing = variantIds.length ? await marketplace.listVariantPricings({ variant_id: variantIds }, { take: null }) : []
  const productIds = [...new Set(pricing.map((p) => p.product_id))]
  const attrs = productIds.length ? await marketplace.listProductAttributes({ product_id: productIds }, { take: null }) : []
  // The engine's thresholds are in USD; convert CAD line prices to USD.
  const toUsd = currency === "USD" ? 1 : 1 / ((await pricingRates())[currency] ?? 1)
  const lines: ShippingCartLine[] = items.map((i, n) => {
    const p = pricing.find((x) => x.variant_id === i.variant_id)
    const a = attrs.find((x) => x.product_id === p?.product_id)
    return {
      id: `line_${n}`,
      quantity: Number(i.quantity),
      unitPriceUsd: Math.round(Number(i.unit_price) * toUsd * 100) / 100,
      location: p?.stock_location === "houston" ? "houston" : "lagos",
      isPreorder: !!a?.is_preorder,
      weightKg: p?.weight_kg ?? null,
    }
  })
  const shippingSettings = resolveShippingSettings(await settingsService.getSettings("shipping"))
  const quote = await quoteShipping(
    { lines, currency },
    { country: address.country_code.toUpperCase(), subdivision: address.province, city: address.city, postalCode: address.postal_code, addressLine1: address.address_1 },
    shippingSettings,
    getShippingAdapters(),
  )
  const stored: StoredQuote = {
    cart_id: cart.id,
    fingerprint,
    currency,
    // The provider charges in the cart currency. Unless the conversion gap fix is on, the legacy
    // behaviour is reproduced: USD amounts labelled with the checkout currency (see decisions S8).
    options: quote.options.map((o) => ({ ...o, currency })),
    origin: quote.origin,
    computed_at: new Date().toISOString(),
  }
  await saveQuote(stored, general.quoteCacheSeconds)
  return { ...stored, shipping_option_id: shippingOptionId, cached: false }
}

async function haantaOptionFor(container: MedusaContainer, countryCode: string): Promise<string | null> {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "shipping_option", fields: ["id", "provider_id", "service_zone.geo_zones.country_code"] })
  const match = data.find(
    (o) =>
      o.provider_id === "haanta_haanta" &&
      ((o.service_zone as { geo_zones?: { country_code: string }[] } | undefined)?.geo_zones ?? []).some((g) => g.country_code === countryCode.toLowerCase()),
  )
  return (match?.id as string | undefined) ?? null
}
