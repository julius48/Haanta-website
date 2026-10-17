/* Shared integration-test helpers. Everything runs against a temporary test database with mocks. */
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IAuthModuleService, IUserModuleService, MedusaContainer } from "@medusajs/framework/types"
import { totp } from "@haanta/core"
import { setupStore, type SetupResult } from "../src/lib/setup-store"
import { applyListing } from "../src/lib/catalog-ops"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../src/modules/marketplace"
import { SECURITY_MODULE, type SecurityService, type StaffRole } from "../src/modules/security"
import { outbox } from "../src/lib/adapters"
import { resetCounterStoreForTest } from "../src/lib/counter-store"
import type { ListingSnapshot } from "../src/lib/listing-schema"

export type Api = {
  get: (url: string, config?: Record<string, unknown>) => Promise<{ status: number; data: any; headers: any }>
  post: (url: string, body?: unknown, config?: Record<string, unknown>) => Promise<{ status: number; data: any; headers: any }>
  delete: (url: string, config?: Record<string, unknown>) => Promise<{ status: number; data: any }>
}

export const PASSWORD = "correct-horse-battery-staple-42"
export const TURNSTILE = { "x-turnstile-token": "test-pass" }

/** Await a request; on HTTP errors throw with the step name, status and body (easier debugging). */
export async function must<T = any>(label: string, p: Promise<{ status: number; data: T }>): Promise<{ status: number; data: T }> {
  try {
    return await p
  } catch (e: any) {
    if (e.response) throw new Error(`${label} failed: ${e.response.status} ${JSON.stringify(e.response.data)}`)
    throw e
  }
}

/** Run a request and return the response even for 4xx/5xx (axios throws on errors). */
export async function call<T = any>(p: Promise<{ status: number; data: T }>): Promise<{ status: number; data: T }> {
  try {
    return await p
  } catch (e: any) {
    if (e.response) return { status: e.response.status, data: e.response.data }
    throw e
  }
}

export function resetState() {
  outbox.length = 0
  resetCounterStoreForTest()
}

export function snapshot(overrides: Partial<ListingSnapshot> = {}, variantOverrides: Partial<ListingSnapshot["variants"][number]> = {}): ListingSnapshot {
  return {
    title: "Adire Wrap Dress",
    subtitle: null,
    description: "<p>Hand-dyed adire cotton.</p>",
    material: "Cotton",
    care: null,
    category_ids: [],
    images: ["https://static.wixstatic.com/media/demo_dress~mv2.webp"],
    fulfilment_type: "ready_to_wear",
    lead_time_days: null,
    is_preorder: false,
    required_measurements: [],
    size_chart_id: null,
    fit_notes: "Runs long",
    styles: ["casual"],
    options: [{ title: "Size", values: ["S", "M"] }],
    variants: [
      { title: "S", sku: null, options: { Size: "S" }, vendor_price_minor: 5000, vendor_currency: "USD", weight_kg: 1, stock_location: "lagos", quantity: 10, fulfilment_type: null, ...variantOverrides },
      { title: "M", sku: null, options: { Size: "M" }, vendor_price_minor: 5000, vendor_currency: "USD", weight_kg: 1, stock_location: "lagos", quantity: 10, fulfilment_type: null, ...variantOverrides },
    ],
    ...overrides,
  }
}

export interface World {
  setup: SetupResult
  vendors: { id: string; name: string }[]
  products: { vendor_id: string; product_id: string; listing_id: string; variant_ids: string[] }[]
}

/** Store setup + two active vendors, each with one live product (Lagos and Houston stock). */
export async function buildWorld(container: MedusaContainer): Promise<World> {
  resetState()
  const setup = await setupStore(container)
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const query = container.resolve<{ graph: (q: Record<string, unknown>) => Promise<{ data: any[] }> }>(ContainerRegistrationKeys.QUERY)
  const vendors = await marketplace.createVendors([
    { name: "Adire Atelier", slug: "adire-atelier", status: "active", origin_country: "NG", region: "Lagos, Nigeria" },
    { name: "Lekki Loom", slug: "lekki-loom", status: "active", origin_country: "NG", region: "Lagos, Nigeria" },
  ])
  const products: World["products"] = []
  for (const [i, v] of vendors.entries()) {
    const snap = snapshot({ title: i === 0 ? "Adire Wrap Dress" : "Aso-Oke Bomber", category_ids: [setup.category_ids["women/dresses"]!] }, { stock_location: i === 0 ? "lagos" : "houston" })
    const listing = await marketplace.createProductListings({ vendor_id: v.id, title: snap.title, status: "in_review", pending_snapshot: snap as never })
    const { product_id } = await applyListing(container, { listing_id: listing.id, vendor_id: v.id, product_id: null, snapshot: snap })
    await marketplace.updateProductListings({ id: listing.id, status: "live", product_id, approved_snapshot: snap as never, pending_snapshot: null })
    const { data } = await query.graph({ entity: "product_variant", fields: ["id", "title"], filters: { product_id } })
    products.push({ vendor_id: v.id, product_id, listing_id: listing.id, variant_ids: data.sort((a, b) => a.title.localeCompare(b.title)).map((x) => x.id) })
  }
  return { setup, vendors: vendors.map((v) => ({ id: v.id, name: v.name })), products }
}

export const storeHeaders = (w: World, extra: Record<string, string> = {}) => ({ headers: { "x-publishable-api-key": w.setup.publishable_key, ...extra } })

/** Create a staff user with a role, sign in, enrol TOTP and verify. Returns auth headers. */
export async function staffLogin(api: Api, container: MedusaContainer, role: StaffRole | null, email = `${role ?? "norole"}@haanta.test`) {
  resetCounterStoreForTest() // each simulated person signs in from their own IP
  const users = container.resolve<IUserModuleService>(Modules.USER)
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const [existing] = await users.listUsers({ email })
  const user = existing ?? (await users.createUsers({ email, first_name: role ?? "none", last_name: "Staff" }))
  if (!existing) {
    await auth.createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email, provider_metadata: { password: await hashPassword(PASSWORD) } }], app_metadata: { user_id: user.id } })
    if (role) await container.resolve<SecurityService>(SECURITY_MODULE).createStaffRoles({ user_id: user.id, role })
  }
  const login = await api.post("/auth/user/emailpass", { email, password: PASSWORD })
  const headers = { authorization: `Bearer ${login.data.token}` }
  if (!role) return { headers, user_id: user.id }
  const setupRes = await call(api.post("/admin/haanta/mfa/setup", {}, { headers }))
  if (setupRes.status === 200) {
    await api.post("/admin/haanta/mfa/confirm", { code: totp(setupRes.data.secret) }, { headers })
  }
  return { headers, user_id: user.id, secret: setupRes.data?.secret as string | undefined }
}

/** Medusa's emailpass provider hashes with scrypt-kdf; reuse it so test users can sign in. */
async function hashPassword(password: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const scrypt = require("scrypt-kdf") as { kdf: (p: string, o: { logN: number; r: number; p: number }) => Promise<Buffer> }
  const buf = await scrypt.kdf(password, { logN: 15, r: 8, p: 1 })
  return buf.toString("base64")
}

/** Full vendor sign-up through the API: register, apply, verify email, enrol TOTP. */
export async function vendorSignup(api: Api, container: MedusaContainer, email: string, business: string, opts: { approve?: boolean } = {}) {
  resetCounterStoreForTest() // each simulated person signs in from their own IP
  const reg = await must("vendor register", api.post("/auth/vendor/emailpass/register", { email, password: PASSWORD }, { headers: TURNSTILE }))
  const regHeaders = { authorization: `Bearer ${reg.data.token}` }
  const app = await must("vendor application", api.post("/vendor/applications", { business_name: business, contact_name: "Test Owner", origin_country: "NG" }, { headers: regHeaders }))
  const login = await must("vendor login", api.post("/auth/vendor/emailpass", { email, password: PASSWORD }, { headers: TURNSTILE }))
  const headers = { authorization: `Bearer ${login.data.token}` }
  const setup = await must("vendor mfa setup", api.post("/vendor/mfa/setup", {}, { headers }))
  await must("vendor mfa confirm", api.post("/vendor/mfa/confirm", { code: totp(setup.data.secret) }, { headers }))
  const mail = [...outbox].reverse().find((m) => m.event === "Vendor Verify Email" && m.to.email === email)
  const token = new URL(String(mail!.properties.verify_url)).searchParams.get("token")!
  await must("vendor verify email", api.post("/vendor/verify-email", { token }, { headers }))
  const vendorId = app.data.vendor.id as string
  if (opts.approve !== false) {
    await container.resolve<MarketplaceService>(MARKETPLACE_MODULE).updateVendors({ id: vendorId, status: "active" })
  }
  return { headers, vendor_id: vendorId, secret: setup.data.secret as string }
}
