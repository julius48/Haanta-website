/**
 * Review queue, markup, ledger and payout flows through the real admin and vendor APIs.
 * Proves ledger balances stay correct under refunds and partial returns.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { setupStore, type SetupResult } from "../../src/lib/setup-store"
import { getStripe } from "../../src/lib/stripe-client"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../src/modules/marketplace"
import { call, must, resetState, snapshot, staffLogin, vendorSignup, type Api } from "../helpers"

jest.setTimeout(400_000)

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: any[] }> }
const TX = { first_name: "Test", last_name: "Buyer", address_1: "1 Main St", city: "Austin", province: "TX", postal_code: "78701", country_code: "us" }

async function buy(a: Api, setup: SetupResult, variantId: string, quantity: number) {
  const h = { headers: { "x-publishable-api-key": setup.publishable_key } }
  const cart = (await a.post("/store/carts", { region_id: setup.region_ids.us, email: "buyer@example.com" }, h)).data.cart
  await a.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantId, quantity }, h)
  await a.post(`/store/carts/${cart.id}`, { shipping_address: TX, billing_address: TX }, h)
  const quote = (await a.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h)).data
  await a.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: quote.shipping_option_id, data: { quote_code: "standard_rate" } }, h)
  const pc = (await a.post("/store/payment-collections", { cart_id: cart.id }, h)).data.payment_collection
  const s = (await a.post(`/store/payment-collections/${pc.id}/payment-sessions`, { provider_id: "pp_stripe_stripe" }, h)).data.payment_collection.payment_sessions
  getStripe().mockConfirm!(s[0].data.id, "pm_card_visa")
  return (await must("complete", a.post(`/store/carts/${cart.id}/complete`, {}, h))).data.order
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > until) throw new Error("waitFor timed out")
    await new Promise((r) => setTimeout(r, 200))
  }
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    const a = api as unknown as Api

    it("review queue: nothing is live until approved; live edits wait in review while the approved version stays live", async () => {
      resetState()
      const container = getContainer()
      const setup = await setupStore(container)
      const vendor = await vendorSignup(a, container, "v@review.test", "Review Studio")
      const reviewer = await staffLogin(a, container, "catalog_reviewer")
      resetState()
      const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)

      const snap = snapshot({ category_ids: [setup.category_ids["women/dresses"]!] })
      const draft = (await must("create", a.post("/vendor/products", { snapshot: snap }, { headers: vendor.headers }))).data
      // Vendor sees the storefront price before submitting: $50 × 1.35 → $68, CAD 68 × 1.37 = 93.16 → 93
      expect(draft.prices[0].retail).toEqual({ USD: 6800, CAD: 9300 })
      // Client-side prices cannot be injected: unknown fields are rejected
      expect((await call(a.post("/vendor/products", { snapshot: { ...snap, retail_price: 1 } }, { headers: vendor.headers }))).status).toBe(400)
      await must("submit", a.post(`/vendor/products/${draft.product.id}/submit`, {}, { headers: vendor.headers }))
      expect((await query.graph({ entity: "product", fields: ["id"], filters: { title: snap.title } })).data).toHaveLength(0)

      const queue = (await a.get("/admin/haanta/review-queue", reviewer)).data
      expect(queue.listings[0]).toMatchObject({ id: draft.product.id, kind: "new_product", vendor_price_usd_minor: 5000, retail_usd_minor: 6800 })
      await must("approve", a.post(`/admin/haanta/review-queue/${draft.product.id}/approve`, { note: "Looks great" }, reviewer))
      const live = (await a.get(`/vendor/products/${draft.product.id}`, { headers: vendor.headers })).data
      expect(live.product.status).toBe("live")
      const productId = live.product.product_id
      const price = async () => {
        const { data } = await query.graph({ entity: "product_variant", fields: ["id", "prices.amount", "prices.currency_code"], filters: { product_id: productId } })
        return data[0].prices.find((p: any) => p.currency_code === "usd").amount
      }
      expect(Number(await price())).toBe(68)

      // Price change on a live product → back to review; storefront keeps $68
      const edited = { ...snap, variants: snap.variants.map((v) => ({ ...v, vendor_price_minor: 6000 })) }
      const upd = (await must("edit live", a.post(`/vendor/products/${draft.product.id}`, { snapshot: edited }, { headers: vendor.headers }))).data
      expect(upd.product.status).toBe("in_review")
      expect(upd.product.has_pending_changes).toBe(true)
      expect(Number(await price())).toBe(68)
      const detail = (await a.get(`/admin/haanta/review-queue/${draft.product.id}`, reviewer)).data
      expect(detail.changes.map((c: any) => c.path)).toEqual(expect.arrayContaining(["variants.S.vendor_price_minor", "variants.M.vendor_price_minor"]))
      // Send back, then approve after resubmission
      await must("request changes", a.post(`/admin/haanta/review-queue/${draft.product.id}/request-changes`, { note: "Please confirm the new price" }, reviewer))
      expect(Number(await price())).toBe(68)
      await must("resubmit", a.post(`/vendor/products/${draft.product.id}/submit`, {}, { headers: vendor.headers }))
      await must("approve 2", a.post(`/admin/haanta/review-queue/${draft.product.id}/approve`, {}, reviewer))
      expect(Number(await price())).toBe(81) // $60 × 1.35 = $81
    })

    it("markup change (finance) reprices, sends live products back to review and is audited", async () => {
      resetState()
      const container = getContainer()
      const setup = await setupStore(container)
      const vendor = await vendorSignup(a, container, "v@markup.test", "Markup Studio")
      const reviewer = await staffLogin(a, container, "catalog_reviewer")
      const finance = await staffLogin(a, container, "finance")
      const admin = await staffLogin(a, container, "admin")
      resetState()
      const snap = snapshot({ category_ids: [setup.category_ids["women/dresses"]!] })
      const draft = (await a.post("/vendor/products", { snapshot: snap }, { headers: vendor.headers })).data
      await a.post(`/vendor/products/${draft.product.id}/submit`, {}, { headers: vendor.headers })
      await a.post(`/admin/haanta/review-queue/${draft.product.id}/approve`, {}, reviewer)

      expect((await call(a.post(`/admin/haanta/markup/vendors/${vendor.vendor_id}`, { markup_bps: 5000, markup_fixed_minor: 0 }, reviewer))).status).toBe(403)
      const res = (await must("markup", a.post(`/admin/haanta/markup/vendors/${vendor.vendor_id}`, { markup_bps: 5000, markup_fixed_minor: 0 }, finance))).data
      expect(res.reprice.sent_to_review).toBe(1)
      const queue = (await a.get("/admin/haanta/review-queue", reviewer)).data
      expect(queue.listings[0]).toMatchObject({ kind: "change_to_live_product", retail_usd_minor: 7500 }) // $50 × 1.5
      const log = (await a.get("/admin/haanta/audit-log?action=markup.vendor", admin)).data.entries
      expect(log[0]).toMatchObject({ actor_id: finance.user_id, before: { markup_bps: null }, after: expect.objectContaining({ markup_bps: 5000 }) })
    })

    it("ledger: delivery → payable → manual payout (finance) → statement; refunds and partial returns reverse correctly", async () => {
      resetState()
      const container = getContainer()
      const setup = await setupStore(container)
      const vendor = await vendorSignup(a, container, "v@ledger.test", "Ledger Studio")
      const reviewer = await staffLogin(a, container, "catalog_reviewer")
      const finance = await staffLogin(a, container, "finance")
      const support = await staffLogin(a, container, "support")
      const admin = await staffLogin(a, container, "admin")
      resetState()
      await must("window", a.post("/admin/haanta/settings/general", { returnWindowDays: 0 }, admin))
      const snap = snapshot({ category_ids: [setup.category_ids["women/dresses"]!] })
      const draft = (await a.post("/vendor/products", { snapshot: snap }, { headers: vendor.headers })).data
      await a.post(`/vendor/products/${draft.product.id}/submit`, {}, { headers: vendor.headers })
      await a.post(`/admin/haanta/review-queue/${draft.product.id}/approve`, {}, reviewer)
      const pricing = await container.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVariantPricings({ vendor_id: vendor.vendor_id })

      // Order 1: 3 units, partial return of 1 after delivery. Order 2: 1 unit, fully refunded before delivery.
      const o1 = await buy(a, setup, pricing[0]!.variant_id, 3)
      const o2 = await buy(a, setup, pricing[0]!.variant_id, 1)
      const earnings = () => a.get("/vendor/earnings", { headers: vendor.headers }).then((r) => r.data)
      await waitFor(async () => (await earnings()).entries.length === 2)
      expect((await earnings()).balance).toMatchObject({ pending_minor: 20000, payable_minor: 0, paid_minor: 0 })

      const lines = async (orderId: string) => (await container.resolve<Query>(ContainerRegistrationKeys.QUERY).graph({ entity: "order", fields: ["items.id"], filters: { id: orderId } })).data[0].items
      const [o2line] = await lines(o2.id)
      // Support cannot refund; finance can
      expect((await call(a.post(`/admin/haanta/refunds/${o2.id}`, { lines: [{ line_item_id: o2line.id, quantity: 1 }], reason: "refund" }, support))).status).toBe(403)
      const r2 = (await must("refund o2", a.post(`/admin/haanta/refunds/${o2.id}`, { lines: [{ line_item_id: o2line.id, quantity: 1 }], reason: "refund" }, finance))).data
      expect(r2.refunded_minor).toBe(6800)
      expect((await earnings()).balance).toMatchObject({ pending_minor: 15000, lifetime_minor: 15000 })
      // Refunding the same unit again is refused before any money moves
      expect((await call(a.post(`/admin/haanta/refunds/${o2.id}`, { lines: [{ line_item_id: o2line.id, quantity: 1 }], reason: "refund" }, finance))).status).toBe(400)

      // Delivery of order 1 (support) → payable after the (zero-day) return window
      await must("delivered", a.post(`/admin/haanta/orders/${o1.id}/delivered`, { delivered_at: new Date(Date.now() - 60_000).toISOString() }, support))
      expect((await earnings()).balance).toMatchObject({ payable_minor: 15000, pending_minor: 0 })

      // Payout: wrong amount refused; correct amount pays the covered entries
      expect((await call(a.post("/admin/haanta/payouts", { vendor_id: vendor.vendor_id, amount_minor: 14999, paid_at: new Date().toISOString(), bank_reference: "GTB-001" }, finance))).status).toBe(400)
      const payout = (await must("payout", a.post("/admin/haanta/payouts", { vendor_id: vendor.vendor_id, amount_minor: 15000, paid_at: new Date().toISOString(), bank_reference: "GTB-001" }, finance))).data.payout
      expect((await earnings()).balance).toMatchObject({ payable_minor: 0, paid_minor: 15000 })
      const pdf = await a.get(`/vendor/earnings/statements/${payout.id}?format=pdf`, { headers: vendor.headers, responseType: "arraybuffer" })
      expect(Buffer.from(pdf.data).subarray(0, 4).toString()).toBe("%PDF")
      const csv = (await a.get(`/vendor/earnings/statements/${payout.id}?format=csv`, { headers: vendor.headers })).data
      expect(String(csv)).toContain("GTB-001")

      // Partial return of 1 unit of order 1 after payout → deduction from the next payout
      const [o1line] = await lines(o1.id)
      await must("return", a.post(`/admin/haanta/refunds/${o1.id}`, { lines: [{ line_item_id: o1line.id, quantity: 1 }], reason: "return" }, finance))
      expect((await earnings()).balance).toMatchObject({ paid_minor: 15000, payable_minor: -5000, lifetime_minor: 10000 })
      // Nothing positive is payable, so no payout can be recorded
      expect((await call(a.post("/admin/haanta/payouts", { vendor_id: vendor.vendor_id, amount_minor: 1, paid_at: new Date().toISOString(), bank_reference: "X" }, finance))).status).toBe(400)

      // Reconciliation: ledger paid total equals recorded payouts
      const rec = (await a.get("/admin/haanta/reconciliation", finance)).data
      expect(rec.ok).toBe(true)
      expect(rec.rows.find((r: any) => r.vendor_id === vendor.vendor_id)).toMatchObject({ ledger_paid_minor: 15000, payouts_minor: 15000, difference_minor: 0 })
      // Payout and refunds are audited
      const log = (await a.get("/admin/haanta/audit-log?action=payout.recorded", admin)).data.entries
      expect(log[0]).toMatchObject({ actor_id: finance.user_id, entity_id: payout.id })
    })
  },
})
