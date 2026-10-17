/**
 * Vendor isolation and buyer-PII tests. Vendor A tries to read and change Vendor B's products,
 * size charts, orders, ledger and payouts through every vendor endpoint; all must be refused.
 * Vendors must never receive buyer personal data from any endpoint or email.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { assertNoBuyerPii } from "@haanta/core"
import { setupStore } from "../../src/lib/setup-store"
import { outbox } from "../../src/lib/adapters"
import { approveListing } from "../../src/lib/review-queue"
import { processOrder, recordDelivery, recordPayout } from "../../src/lib/ledger-ops"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../src/modules/haanta-settings"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../src/modules/marketplace"
import { getStripe } from "../../src/lib/stripe-client"
import { call, resetState, snapshot, vendorSignup, type Api } from "../helpers"

jest.setTimeout(300_000)

const BUYER = { email: "adaeze.buyer@example.com", first_name: "Adaeze", last_name: "Okafor", phone: "+15125550199", address_1: "742 Evergreen Terrace", city: "Austin", province: "TX", postal_code: "78701", country_code: "us" }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    const a = api as unknown as Api

    it("refuses every cross-vendor read and write and never leaks buyer data", async () => {
      resetState()
      const container = getContainer()
      const setup = await setupStore(container)
      await container.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).putSettings("general", { returnWindowDays: 0 }, "test")
      const A = await vendorSignup(a, container, "owner@vendor-a.test", "Vendor A Studio")
      const B = await vendorSignup(a, container, "owner@vendor-b.test", "Vendor B Atelier")

      // B creates a size chart and a product; Haanta approves it.
      const chart = (await a.post("/vendor/size-charts", { name: "B chart", unit: "in", rows: [{ label: "S", us: "4", uk: "8", measurements: { bust: "34" } }] }, { headers: B.headers })).data.size_chart
      const snap = snapshot({ title: "B Dress", category_ids: [setup.category_ids["women/dresses"]!], size_chart_id: chart.id })
      const created = (await a.post("/vendor/products", { snapshot: snap }, { headers: B.headers })).data.product
      await a.post(`/vendor/products/${created.id}/submit`, {}, { headers: B.headers })
      const approved = await approveListing(container, created.id, "user_test")

      // A buyer orders B's product.
      const h = { headers: { "x-publishable-api-key": setup.publishable_key } }
      const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
      const pricing = await marketplace.listVariantPricings({ product_id: approved.product_id! })
      const cart = (await a.post("/store/carts", { region_id: setup.region_ids.us, email: BUYER.email }, h)).data.cart
      await a.post(`/store/carts/${cart.id}/line-items`, { variant_id: pricing[0]!.variant_id, quantity: 1, metadata: { measurements: { bust: 35 } } }, h)
      const address = { first_name: BUYER.first_name, last_name: BUYER.last_name, phone: BUYER.phone, address_1: BUYER.address_1, city: BUYER.city, province: BUYER.province, postal_code: BUYER.postal_code, country_code: BUYER.country_code }
      await a.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, h)
      const quote = (await a.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h)).data
      await a.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: quote.shipping_option_id, data: { quote_code: "standard_rate" } }, h)
      const pc = (await a.post("/store/payment-collections", { cart_id: cart.id }, h)).data.payment_collection
      const sessions = (await a.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_stripe_stripe" }, h)).data.payment_collection.payment_sessions
      getStripe().mockConfirm!(sessions[0].data.id, "pm_card_visa")
      const order = (await a.post(`/store/carts/${cart.id}/complete`, {}, h)).data.order
      await processOrder(container, order.id) // idempotent with the subscriber
      await recordDelivery(container, order.id, new Date(Date.now() - 1000))
      const [vo] = await marketplace.listVendorOrders({ order_id: order.id })
      const bEarnings = (await a.get("/vendor/earnings", { headers: B.headers })).data
      const payable = bEarnings.balance.payable_minor
      expect(payable).toBe(5000)
      const { payout } = await recordPayout(container, { vendor_id: B.vendor_id, amount_minor: payable, paid_at: new Date(), bank_reference: "GTB-REF-001" }, "user_test")

      // ---- Vendor A attacks every vendor endpoint with B's ids ----
      const denied = async (p: Promise<{ status: number; data: any }>) => expect((await call(p)).status).toBe(404)
      await denied(a.get(`/vendor/products/${created.id}`, { headers: A.headers }))
      await denied(a.post(`/vendor/products/${created.id}`, { snapshot: snap }, { headers: A.headers }))
      await denied(a.post(`/vendor/products/${created.id}/submit`, {}, { headers: A.headers }))
      await denied(a.delete(`/vendor/products/${created.id}`, { headers: A.headers }))
      await denied(a.get(`/vendor/size-charts/${chart.id}`, { headers: A.headers }))
      await denied(a.post(`/vendor/size-charts/${chart.id}`, { name: "x", unit: "in", rows: [{ label: "S", measurements: {} }] }, { headers: A.headers }))
      await denied(a.delete(`/vendor/size-charts/${chart.id}`, { headers: A.headers }))
      // Using B's size chart on A's own product is refused too
      expect((await call(a.post("/vendor/products", { snapshot: { ...snap, title: "A uses B chart" } }, { headers: A.headers }))).status).toBe(404)
      await denied(a.get(`/vendor/orders/${vo!.id}`, { headers: A.headers }))
      await denied(a.post(`/vendor/orders/${vo!.id}/status`, { status: "accepted" }, { headers: A.headers }))
      await denied(a.get(`/vendor/earnings/statements/${payout.id}?format=csv`, { headers: A.headers }))
      await denied(a.get(`/vendor/earnings/statements/${payout.id}?format=pdf`, { headers: A.headers }))

      // Lists never include another vendor's data, even with smuggled filters
      const aProducts = (await a.get(`/vendor/products?vendor_id=${B.vendor_id}`, { headers: A.headers }).catch((e) => e.response)).data
      expect(JSON.stringify(aProducts)).not.toContain(created.id)
      const aOrders = (await a.get("/vendor/orders", { headers: A.headers })).data
      expect(aOrders.orders).toEqual([])
      const aEarnings = (await a.get("/vendor/earnings", { headers: A.headers })).data
      expect(aEarnings.entries).toEqual([])
      expect(aEarnings.payouts).toEqual([])
      expect(aEarnings.balance.lifetime_minor).toBe(0)
      const aAnalytics = (await a.get("/vendor/analytics", { headers: A.headers })).data
      expect(aAnalytics.best_sellers).toEqual([])
      const aCharts = (await a.get("/vendor/size-charts", { headers: A.headers })).data
      expect(aCharts.size_charts).toEqual([])

      // B's data is intact after A's attempts
      expect((await a.get(`/vendor/products/${created.id}`, { headers: B.headers })).data.product.status).toBe("live")
      expect((await a.get(`/vendor/size-charts/${chart.id}`, { headers: B.headers })).data.size_chart.name).toBe("B chart")

      // ---- No buyer PII anywhere a vendor can see ----
      const buyer = { email: BUYER.email, names: [BUYER.first_name, BUYER.last_name], phone: BUYER.phone, address_lines: [BUYER.address_1] }
      const bOrders = (await a.get("/vendor/orders", { headers: B.headers })).data
      expect(bOrders.orders).toHaveLength(1)
      expect(bOrders.orders[0].lines[0].measurements).toEqual({ bust: 35 })
      expect(bOrders.orders[0].ship_to.city).toBe("Houston")
      const bOrder = (await a.get(`/vendor/orders/${vo!.id}`, { headers: B.headers })).data
      const bEarnings2 = (await a.get("/vendor/earnings", { headers: B.headers })).data
      const bAnalytics = (await a.get("/vendor/analytics", { headers: B.headers })).data
      const csv = (await a.get(`/vendor/earnings/statements/${payout.id}?format=csv`, { headers: B.headers })).data
      for (const payload of [bOrders, bOrder, bEarnings2, bAnalytics]) assertNoBuyerPii(payload, buyer)
      expect(String(csv)).not.toContain(BUYER.last_name)
      expect(String(csv)).not.toContain(BUYER.email)
      const vendorMail = outbox.filter((m) => m.audience === "vendor")
      expect(vendorMail.some((m) => m.event === "Vendor New Order")).toBe(true)
      for (const m of vendorMail) {
        expect(JSON.stringify(m.properties)).not.toContain(BUYER.email)
        expect(JSON.stringify(m.properties)).not.toContain(BUYER.last_name)
        expect(JSON.stringify(m.properties)).not.toContain(BUYER.address_1)
        expect(JSON.stringify(m.properties)).not.toContain(BUYER.phone)
      }
    })

    it("requires MFA and a verified email before vendor data is reachable", async () => {
      resetState()
      const container = getContainer()
      await setupStore(container)
      const email = "nomfa@vendor.test"
      const reg = await a.post("/auth/vendor/emailpass/register", { email, password: "correct-horse-battery-staple-42" }, { headers: { "x-turnstile-token": "ok" } })
      await a.post("/vendor/applications", { business_name: "No MFA", contact_name: "Owner", origin_country: "NG" }, { headers: { authorization: `Bearer ${reg.data.token}` } })
      const login = await a.post("/auth/vendor/emailpass", { email, password: "correct-horse-battery-staple-42" }, { headers: { "x-turnstile-token": "ok" } })
      const headers = { authorization: `Bearer ${login.data.token}` }
      const blocked = await call(a.get("/vendor/products", { headers }))
      expect(blocked.status).toBe(403)
      expect(blocked.data.code).toBe("mfa_required")
      // A wrong TOTP code does not unlock anything
      await a.post("/vendor/mfa/setup", {}, { headers })
      expect((await call(a.post("/vendor/mfa/confirm", { code: "000000" }, { headers }))).status).toBe(400)
      expect((await call(a.get("/vendor/orders", { headers }))).data.code).toBe("mfa_required")
      // Unauthenticated
      expect((await call(a.get("/vendor/products"))).status).toBe(401)
      // A customer token is not a vendor token
      const creg = await a.post("/auth/customer/emailpass/register", { email: "buyer2@example.com", password: "correct-horse-battery-staple-42" }, { headers: { "x-turnstile-token": "ok" } })
      expect((await call(a.get("/vendor/products", { headers: { authorization: `Bearer ${creg.data.token}` } }))).status).toBe(401)
    })
  },
})
