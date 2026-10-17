/**
 * Idempotent store setup used by the seed script, the catalog import and integration tests.
 * Creates: currencies, sales channel + publishable key, regions (US, Canada, Mexico), stock locations
 * (Lagos, Houston hub), the calculated Haanta shipping option per zone, category tree and promotions.
 */
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import type { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createPromotionsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { CATEGORY_TREE } from "@haanta/core"
import { HAANTA_SHIPPING_OPTION_ID } from "../modules/haanta-shipping"
import { resetStoreContextCache } from "./catalog-ops"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }
type Link = { create: (l: Record<string, unknown>) => Promise<unknown> }
type Logger = { info: (m: string) => void }

export const PAYMENT_PROVIDERS = ["pp_stripe_stripe", "pp_paypal_paypal"]
export const SHIPPING_COUNTRIES = { US: "us", CA: "ca", MX: "mx" } as const

export interface SetupResult {
  sales_channel_id: string
  publishable_key: string
  region_ids: Record<"us" | "ca" | "mx", string>
  location_ids: { lagos: string; houston: string }
  category_ids: Record<string, string>
}

export async function setupStore(container: MedusaContainer, logger?: Logger): Promise<SetupResult> {
  const log = (m: string) => logger?.info(`[setup] ${m}`)
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const link = container.resolve<Link>(ContainerRegistrationKeys.LINK)

  // Sales channel
  let { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id", "name"], filters: { name: "Haanta Storefront" } })
  if (!channels.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "Haanta Storefront", description: "www.haanta.com" }] } })
    channels = result as unknown as Record<string, unknown>[]
    log("sales channel created")
  }
  const salesChannelId = channels[0]!.id as string

  // Store currencies (USD default, CAD)
  const { data: stores } = await query.graph({ entity: "store", fields: ["id"] })
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: stores[0]!.id as string },
      update: {
        name: "Haanta",
        supported_currencies: [
          { currency_code: "usd", is_default: true },
          { currency_code: "cad" },
        ],
        default_sales_channel_id: salesChannelId,
      },
    },
  })

  // Regions. Prices are duty-inclusive (DDP): no taxes added at checkout.
  const regionDefs = [
    { key: "us" as const, name: "United States", currency_code: "usd", countries: ["us"] },
    { key: "ca" as const, name: "Canada", currency_code: "cad", countries: ["ca"] },
    { key: "mx" as const, name: "Mexico", currency_code: "usd", countries: ["mx"] },
  ]
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "name"] })
  const region_ids = {} as SetupResult["region_ids"]
  for (const r of regionDefs) {
    const existing = regions.find((x) => x.name === r.name)
    if (existing) {
      region_ids[r.key] = existing.id as string
      continue
    }
    const { result } = await createRegionsWorkflow(container).run({
      input: { regions: [{ name: r.name, currency_code: r.currency_code, countries: r.countries, payment_providers: PAYMENT_PROVIDERS, automatic_taxes: false }] },
    })
    region_ids[r.key] = result[0]!.id
    log(`region ${r.name} created`)
  }

  // Shipping profile
  let { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
  if (!profiles.length) {
    const { result } = await createShippingProfilesWorkflow(container).run({ input: { data: [{ name: "Default", type: "default" }] } })
    profiles = result as unknown as Record<string, unknown>[]
  }
  const profileId = (profiles.find((p) => p.type === "default") ?? profiles[0])!.id as string

  // Stock locations
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name", "metadata"] })
  const locDefs = [
    { code: "lagos", name: "Lagos studios (vendor stock)", address: { address_1: "Vendor studios", city: "Lagos", country_code: "NG" } },
    { code: "houston", name: "Haanta Houston hub", address: { address_1: "Set in Admin → Settings", city: "Houston", province: "TX", country_code: "US" } },
  ] as const
  const location_ids = {} as SetupResult["location_ids"]
  for (const l of locDefs) {
    const existing = locations.find((x) => (x.metadata as Record<string, unknown> | null)?.code === l.code)
    if (existing) {
      location_ids[l.code] = existing.id as string
      continue
    }
    const { result } = await createStockLocationsWorkflow(container).run({ input: { locations: [{ name: l.name, address: l.address, metadata: { code: l.code } }] } })
    location_ids[l.code] = result[0]!.id
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: result[0]!.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: "haanta_haanta" } })
    await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: result[0]!.id, add: [salesChannelId] } })
    log(`stock location ${l.code} created`)
  }

  // One fulfilment set on the hub with a zone per destination country and a calculated Haanta option
  const fulfillment = container.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)
  const { data: sets } = await query.graph({ entity: "fulfillment_set", fields: ["id", "name", "service_zones.id", "service_zones.name"], filters: { name: "Haanta shipping" } })
  if (!sets.length) {
    const set = await fulfillment.createFulfillmentSets({
      name: "Haanta shipping",
      type: "shipping",
      service_zones: [
        { name: "United States", geo_zones: [{ type: "country", country_code: "us" }] },
        { name: "Canada", geo_zones: [{ type: "country", country_code: "ca" }] },
        { name: "Mexico", geo_zones: [{ type: "country", country_code: "mx" }] },
      ],
    })
    await link.create({ [Modules.STOCK_LOCATION]: { stock_location_id: location_ids.houston }, [Modules.FULFILLMENT]: { fulfillment_set_id: set.id } })
    await createShippingOptionsWorkflow(container).run({
      input: set.service_zones.map((z) => ({
        name: "Haanta shipping",
        price_type: "calculated" as const,
        provider_id: "haanta_haanta",
        service_zone_id: z.id,
        shipping_profile_id: profileId,
        type: { label: "Haanta shipping", description: "Options from the Haanta shipping engine", code: "haanta" },
        data: { id: HAANTA_SHIPPING_OPTION_ID },
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
          { attribute: "is_return", value: "false", operator: "eq" as const },
        ],
      })),
    })
    log("shipping options created")
  }

  // Publishable API key
  const { data: keys } = await query.graph({ entity: "api_key", fields: ["id", "token", "title"], filters: { type: "publishable" } })
  let key = keys.find((k) => k.title === "Haanta Storefront")
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({ input: { api_keys: [{ title: "Haanta Storefront", type: "publishable", created_by: "" }] } })
    key = result[0] as unknown as Record<string, unknown>
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id as string, add: [salesChannelId] } })
    log("publishable key created")
  }

  // Category tree
  const { data: cats } = await query.graph({ entity: "product_category", fields: ["id", "handle"] })
  const category_ids: Record<string, string> = Object.fromEntries(cats.map((c) => [c.handle as string, c.id as string]))
  for (const c of CATEGORY_TREE) {
    const handle = c.handle.replace(/\//g, "-")
    if (category_ids[c.handle] || category_ids[handle]) {
      category_ids[c.handle] = category_ids[c.handle] ?? category_ids[handle]!
      continue
    }
    const parent = c.parent ? category_ids[c.parent] : null
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: [{ name: c.name, handle, is_active: true, is_internal: false, parent_category_id: parent ?? null, metadata: { path: c.handle } }] },
    })
    category_ids[c.handle] = result[0]!.id
  }

  // Promotions from the Wix collections (codes are settings in the admin)
  const { data: promos } = await query.graph({ entity: "promotion", fields: ["id", "code"] })
  const promoDefs = [
    { code: "BLACKFRIDAY", status: "draft" as const, value: 20, type: "percentage" as const, target: "items" as const, description: "Black Friday sale (activate in the admin)" },
    { code: "FIFTEEN", status: "active" as const, value: 15, type: "percentage" as const, target: "items" as const, description: "15% off" },
    { code: "FREESHIP", status: "draft" as const, value: 100, type: "percentage" as const, target: "shipping_methods" as const, description: "Free shipping" },
  ]
  for (const p of promoDefs) {
    if (promos.some((x) => x.code === p.code)) continue
    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: p.code,
            type: "standard",
            status: p.status,
            is_automatic: false,
            application_method: {
              type: p.type,
              target_type: p.target,
              allocation: "across",
              value: p.value,
              currency_code: "usd",
            },
          },
        ],
      },
    })
  }

  resetStoreContextCache()
  void ProductStatus
  return { sales_channel_id: salesChannelId, publishable_key: key.token as string, region_ids, location_ids, category_ids }
}
