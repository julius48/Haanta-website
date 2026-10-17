/**
 * Local demo seed: store setup, an admin (with the admin staff role), demo vendors with live
 * products, and a demo buyer. Idempotent. Run: pnpm --filter @haanta/backend seed
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import { setupStore } from "../lib/setup-store"
import { applyListing } from "../lib/catalog-ops"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { SECURITY_MODULE, type SecurityService } from "../modules/security"
import type { ListingSnapshot } from "../lib/listing-schema"

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@haanta.local"
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "haanta-local-admin-2026"

const img = (seed: string) => `https://static.wixstatic.com/media/${seed}~mv2.webp`

function product(title: string, price: number, location: "lagos" | "houston", categoryId: string, extra: Partial<ListingSnapshot> = {}): ListingSnapshot {
  const sizes = ["S", "M", "L"]
  return {
    title,
    subtitle: null,
    description: `<p>${title}, handmade by our partner designers.</p>`,
    material: "Cotton",
    care: "Hand wash cold",
    category_ids: [categoryId],
    images: [img("a3919b_67492d3ab519482f84871f1096e9e59d")],
    fulfilment_type: "ready_to_wear",
    lead_time_days: null,
    is_preorder: false,
    required_measurements: [],
    size_chart_id: null,
    fit_notes: null,
    styles: ["casual"],
    options: [{ title: "Size", values: sizes }],
    variants: sizes.map((s) => ({ title: s, sku: null, options: { Size: s }, vendor_price_minor: price, vendor_currency: "USD" as const, weight_kg: 1.5, stock_location: location, quantity: 10, fulfilment_type: null })),
    ...extra,
  }
}

export default async function seed({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const setup = await setupStore(container, logger)

  // Admin user + admin staff role
  const users = container.resolve(Modules.USER)
  const [existingAdmin] = await users.listUsers({ email: ADMIN_EMAIL })
  if (!existingAdmin) {
    const auth = container.resolve(Modules.AUTH)
    const { authIdentity } = await auth.register("emailpass", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } } as never)
    const { result } = await createUserAccountWorkflow(container).run({ input: { authIdentityId: authIdentity!.id, userData: { email: ADMIN_EMAIL, first_name: "Haanta", last_name: "Admin" } } })
    await container.resolve<SecurityService>(SECURITY_MODULE).createStaffRoles({ user_id: result.id, role: "admin" })
    logger.info(`[seed] admin created: ${ADMIN_EMAIL}`)
  }

  // Demo vendors and live products
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const demo = [
    { name: "Adire Atelier (demo)", slug: "adire-atelier-demo", region: "Lagos, Nigeria", products: [product("Adire Wrap Dress", 5500, "lagos", setup.category_ids["women/dresses"]!), product("Indigo Two-Piece Set", 7000, "lagos", setup.category_ids["women/sets"]!, { fulfilment_type: "made_to_order", lead_time_days: 14, required_measurements: ["bust", "waist", "hips"] })] },
    { name: "Lekki Loom (demo)", slug: "lekki-loom-demo", region: "Lagos, Nigeria", products: [product("Aso-Oke Bomber Jacket", 9000, "houston", setup.category_ids["men/jackets"]!), product("Ankara Shirt", 4000, "houston", setup.category_ids["men/tops"]!)] },
  ]
  for (const d of demo) {
    let [vendor] = await marketplace.listVendors({ slug: d.slug })
    if (!vendor) vendor = await marketplace.createVendors({ name: d.name, slug: d.slug, region: d.region, status: "active", origin_country: "NG", story: `<p>${d.name} is a demo brand for local development.</p>` })
    for (const snap of d.products) {
      const [exists] = await marketplace.listProductListings({ vendor_id: vendor.id, title: snap.title })
      if (exists) continue
      const listing = await marketplace.createProductListings({ vendor_id: vendor.id, title: snap.title, status: "in_review", pending_snapshot: snap as never })
      const { product_id } = await applyListing(container, { listing_id: listing.id, vendor_id: vendor.id, product_id: null, snapshot: snap })
      await marketplace.updateProductListings({ id: listing.id, status: "live", product_id, approved_snapshot: snap as never, pending_snapshot: null })
      logger.info(`[seed] product ${snap.title}`)
    }
  }

  logger.info(`[seed] publishable key: ${setup.publishable_key}`)
  logger.info(`[seed] admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (local only)`)
}
