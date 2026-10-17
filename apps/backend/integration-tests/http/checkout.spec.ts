import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { getStripe } from "../../src/lib/stripe-client"
import { LEDGER_MODULE, type LedgerService } from "../../src/modules/ledger"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../src/modules/marketplace"
import { buildWorld, call, storeHeaders, type Api, type World } from "../helpers"

jest.setTimeout(240_000)

const TX = { first_name: "Test", last_name: "Buyer", address_1: "1 Main St", city: "Austin", province: "TX", postal_code: "78701", country_code: "us", phone: "+15125550100" }

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > until) throw new Error("waitFor timed out")
    await new Promise((r) => setTimeout(r, 200))
  }
}

export async function checkout(api: Api, w: World, items: { variant_id: string; quantity: number }[], address = TX, quoteCode = "standard_rate", paymentMethod = "pm_card_visa") {
  const h = storeHeaders(w)
  const region = address.country_code === "ca" ? w.setup.region_ids.ca : address.country_code === "mx" ? w.setup.region_ids.mx : w.setup.region_ids.us
  const cart = (await api.post("/store/carts", { region_id: region, email: "buyer@example.com" }, h)).data.cart
  for (const it of items) await api.post(`/store/carts/${cart.id}/line-items`, it, h)
  await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, h)
  const quote = (await api.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h)).data
  await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: quote.shipping_option_id, data: { quote_code: quoteCode } }, h)
  const pc = (await api.post("/store/payment-collections", { cart_id: cart.id }, h)).data.payment_collection
  const sessions = (await api.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_stripe_stripe" }, h)).data.payment_collection.payment_sessions
  getStripe().mockConfirm!(sessions[0].data.id, paymentMethod)
  const done = await call(api.post(`/store/carts/${cart.id}/complete`, {}, h))
  return { cart, quote, done }
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let w: World
    beforeEach(async () => {
      w = await buildWorld(getContainer())
    })

    it("quotes shipping, charges the engine price and completes a mixed cart into vendor orders and ledger entries", async () => {
      const lagosVariant = w.products[0]!.variant_ids[0]!
      const houstonVariant = w.products[1]!.variant_ids[0]!
      const { quote, done } = await checkout(api as Api, w, [
        { variant_id: lagosVariant, quantity: 1 },
        { variant_id: houstonVariant, quantity: 1 },
      ])
      // $50 vendor price × 1.35 = $67.50 → $68 retail each; subtotal $136 < $150 → $20 standard
      expect(quote.origin).toBe("mixed")
      expect(quote.options.map((o: any) => [o.code, o.amount])).toEqual([
        ["standard_rate", 20],
        ["expedited_rate", 42], // 1 kg FEZ: (70,201.25 − 13,500) / 1,350 = 42.00 (mock live rate 1,500 is capped)
      ])
      expect(done.status).toBe(200)
      expect(done.data.type).toBe("order")
      const order = done.data.order
      expect(Number(order.shipping_total)).toBe(20)
      expect(Number(order.item_total)).toBe(136)

      const marketplace = getContainer().resolve<MarketplaceService>(MARKETPLACE_MODULE)
      const ledger = getContainer().resolve<LedgerService>(LEDGER_MODULE)
      const vendorOrders = await waitFor(async () => {
        const v = await marketplace.listVendorOrders({ order_id: order.id })
        return v.length === 2 ? v : null
      })
      expect(vendorOrders.map((v) => v.vendor_id).sort()).toEqual(w.vendors.map((v) => v.id).sort())
      const entries = await waitFor(async () => {
        const e = await ledger.listLedgerEntries({ order_id: order.id })
        return e.length === 2 ? e : null
      })
      expect(entries.every((e) => e.type === "sale" && Number(e.amount_minor) === 5000)).toBe(true)
      const snaps = await marketplace.listLinePriceSnapshots({ order_id: order.id })
      expect(snaps.map((s) => [Number(s.vendor_price_minor), Number(s.retail_price_minor)])).toEqual([
        [5000, 6800],
        [5000, 6800],
      ])
    })

    it("rejects a shipping method whose quote no longer matches the cart", async () => {
      const h = storeHeaders(w)
      const cart = (await api.post("/store/carts", { region_id: w.setup.region_ids.us }, h)).data.cart
      await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: w.products[0]!.variant_ids[0], quantity: 1 }, h)
      await api.post(`/store/carts/${cart.id}`, { shipping_address: TX }, h)
      const quote = (await api.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h)).data
      // Cart changes after quoting → stale quote is refused
      await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: w.products[0]!.variant_ids[1], quantity: 3 }, h)
      const res = await call(api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: quote.shipping_option_id, data: { quote_code: "standard_rate" } }, h))
      expect(res.status).toBeGreaterThanOrEqual(400)
      // Unknown codes are refused
      await api.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h)
      const bad = await call(api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: quote.shipping_option_id, data: { quote_code: "free_everything" } }, h))
      expect(bad.status).toBeGreaterThanOrEqual(400)
    })

    it("ignores client-supplied line item metadata other than measurements", async () => {
      const h = storeHeaders(w)
      const cart = (await api.post("/store/carts", { region_id: w.setup.region_ids.us }, h)).data.cart
      const res = await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: w.products[0]!.variant_ids[0], quantity: 1, metadata: { vendor_price_minor: 1, measurements: { bust: 36 } } }, h)
      const item = res.data.cart.items[0]
      expect(item.metadata).toEqual({ measurements: { bust: 36 } })
      expect(Number(item.unit_price)).toBe(68)
    })
  },
})
