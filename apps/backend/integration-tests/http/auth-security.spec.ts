/**
 * Authentication hardening, staff roles + MFA, CSRF, webhooks, append-only audit, headers, rate limits.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { setupStore } from "../../src/lib/setup-store"
import { signStripePayload } from "../../src/lib/stripe-client"
import { signPayPalMockPayload } from "../../src/lib/paypal-client"
import { AUDIT_MODULE, type AuditService } from "../../src/modules/audit"
import { call, must, PASSWORD, resetState, staffLogin, TURNSTILE, type Api } from "../helpers"

jest.setTimeout(300_000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    const a = api as unknown as Api
    beforeEach(async () => {
      resetState()
      await setupStore(getContainer())
    })

    it("enforces password policy, breached-password check and Turnstile on sign-up", async () => {
      const reg = (password: string, headers: Record<string, string> = TURNSTILE) => call(a.post("/auth/customer/emailpass/register", { email: "new@example.com", password }, { headers }))
      const short = await reg("short-pass")
      expect(short.status).toBe(400)
      expect(short.data.code).toBe("weak_password")
      const breached = await reg("password1234")
      expect(breached.data.problems).toContain("breached")
      expect((await reg(PASSWORD, {})).data.code).toBe("turnstile_failed")
      expect((await reg(PASSWORD, { "x-turnstile-token": "fail" })).data.code).toBe("turnstile_failed")
      expect((await reg(PASSWORD)).status).toBe(200)
    })

    it("locks an account after repeated failed logins, even with the right password", async () => {
      await must("register", a.post("/auth/customer/emailpass/register", { email: "locked@example.com", password: PASSWORD }, { headers: TURNSTILE }))
      for (let i = 0; i < 5; i++) {
        expect((await call(a.post("/auth/customer/emailpass", { email: "locked@example.com", password: "wrong-password-123" }, { headers: TURNSTILE }))).status).toBe(401)
      }
      const locked = await call(a.post("/auth/customer/emailpass", { email: "locked@example.com", password: PASSWORD }, { headers: TURNSTILE }))
      expect(locked.status).toBe(429)
      expect(locked.data.code).toBe("account_locked")
    })

    it("applies staff sub-roles with least privilege and requires MFA", async () => {
      const container = getContainer()
      // No staff role → nothing
      const none = await staffLogin(a, container, null)
      expect((await call(a.get("/admin/haanta/dashboard", { headers: none.headers }))).data.code).toBe("no_staff_role")
      expect((await call(a.get("/admin/products", { headers: none.headers }))).data.code).toBe("no_staff_role")

      // Role but no MFA yet → only bootstrap routes
      const login = await a.post("/auth/user/emailpass", { email: "support-nomfa@haanta.test", password: PASSWORD }).catch(() => null)
      void login
      const support = await staffLogin(a, container, "support")
      const finance = await staffLogin(a, container, "finance")
      const reviewer = await staffLogin(a, container, "catalog_reviewer")
      const admin = await staffLogin(a, container, "admin")

      const status = async (h: { headers: Record<string, string> }, method: "get" | "post", url: string, body?: unknown) =>
        (await call(method === "get" ? a.get(url, h) : a.post(url, body ?? {}, h))).status

      // support
      expect(await status(support, "get", "/admin/haanta/orders")).toBe(200)
      expect(await status(support, "get", "/admin/haanta/payouts")).toBe(403)
      expect(await status(support, "post", "/admin/haanta/payouts", { vendor_id: "ven_x", amount_minor: 1, paid_at: new Date().toISOString(), bank_reference: "REF" })).toBe(403)
      expect(await status(support, "get", "/admin/haanta/audit-log")).toBe(403)
      expect(await status(support, "post", "/admin/haanta/settings/general", { returnWindowDays: 1 })).toBe(403)
      // finance
      expect(await status(finance, "get", "/admin/haanta/payouts")).toBe(200)
      expect(await status(finance, "get", "/admin/haanta/reconciliation")).toBe(200)
      expect(await status(finance, "post", "/admin/haanta/settings/pricing", { rounding: "x99" })).toBe(200)
      expect(await status(finance, "post", "/admin/haanta/settings/general", { returnWindowDays: 1 })).toBe(403)
      expect(await status(finance, "get", "/admin/haanta/review-queue")).toBe(403)
      // catalog reviewer
      expect(await status(reviewer, "get", "/admin/haanta/review-queue")).toBe(200)
      expect(await status(reviewer, "get", "/admin/haanta/payouts")).toBe(403)
      expect(await status(reviewer, "post", "/admin/haanta/markup/categories", { category_id: "pcat_x", markup_bps: 1000, markup_fixed_minor: 0 })).toBe(403)
      // admin
      expect(await status(admin, "get", "/admin/haanta/audit-log")).toBe(200)
      expect(await status(admin, "post", "/admin/haanta/settings/general", { returnWindowDays: 7 })).toBe(200)

      // The pricing change by finance is in the audit log with before/after.
      const log = (await a.get("/admin/haanta/audit-log?action=settings.pricing", admin)).data.entries
      expect(log).toHaveLength(1)
      expect(log[0].actor_id).toBe(finance.user_id)
      expect(log[0].before.rounding).toBe("whole")
      expect(log[0].after.rounding).toBe("x99")

      // Fresh login without MFA verification → blocked except bootstrap routes
      resetState() // the logins above used up this IP's auth rate limit (which is the intended behaviour)
      const fresh = await a.post("/auth/user/emailpass", { email: "finance@haanta.test", password: PASSWORD })
      const h = { headers: { authorization: `Bearer ${fresh.data.token}` } }
      expect((await call(a.get("/admin/haanta/payouts", h))).data.code).toBe("mfa_required")
      expect((await call(a.get("/admin/haanta/me", h))).status).toBe(200)
      expect((await call(a.post("/admin/haanta/mfa/verify", { code: "123456" }, h))).status).toBe(400)
    })

    it("blocks cross-site cookie requests (CSRF) and sets security headers", async () => {
      // A real admin session cookie (the attack scenario: a signed-in admin visits a malicious site).
      const admin = await staffLogin(a, getContainer(), "admin")
      const session = await a.post("/auth/session", {}, admin)
      const cookie = String((session.headers["set-cookie"] as string[] | undefined)?.find((c) => c.startsWith("haanta.sid=")) ?? "").split(";")[0]!
      expect(cookie).toMatch(/^haanta\.sid=/)
      const setCookie = (session.headers["set-cookie"] as string[]).find((c) => c.startsWith("haanta.sid="))!
      expect(setCookie).toMatch(/HttpOnly/i)
      expect(setCookie).toMatch(/SameSite=Lax/i)
      const body = { returnWindowDays: 1 }
      const evil = await call(a.post("/admin/haanta/settings/general", body, { headers: { cookie, origin: "https://evil.example" } }))
      expect(evil.status).toBe(403)
      expect(evil.data.code).toBe("csrf_origin")
      const noOrigin = await call(a.post("/admin/haanta/settings/general", body, { headers: { cookie } }))
      expect(noOrigin.data.code).toBe("csrf_origin")
      // Same-origin request passes the CSRF check (and then needs this session's own TOTP verification).
      const sameOrigin = await call(a.post("/admin/haanta/settings/general", body, { headers: { cookie, origin: "http://localhost:9000" } }))
      expect(sameOrigin.data.code).toBe("mfa_required")
      const res = await a.get("/store/haanta/settings", { headers: { "x-publishable-api-key": (await setupStore(getContainer())).publishable_key } })
      expect(res.headers["x-content-type-options"]).toBe("nosniff")
      expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'")
      expect(res.headers["x-frame-options"]).toBe("DENY")
    })

    it("verifies webhook signatures and processes each event once", async () => {
      const event = JSON.stringify({ id: "evt_test_1", object: "event", type: "payment_intent.payment_failed", data: { object: { id: "pi_x", metadata: {}, last_payment_error: { code: "card_declined" } } } })
      expect((await call(a.post("/webhooks/stripe", event, { headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" } }))).status).toBe(400)
      const sig = signStripePayload(event)
      const first = await a.post("/webhooks/stripe", event, { headers: { "content-type": "application/json", "stripe-signature": sig } })
      expect(first.data.outcome).toBe("processed")
      const replay = await a.post("/webhooks/stripe", event, { headers: { "content-type": "application/json", "stripe-signature": sig } })
      expect(replay.data.outcome).toBe("duplicate")

      const pp = JSON.stringify({ id: "WH-1", event_type: "PAYMENT.CAPTURE.DENIED", resource: { id: "CAP1" } })
      expect((await call(a.post("/webhooks/paypal", pp, { headers: { "content-type": "application/json", "paypal-mock-signature": "bad" } }))).status).toBe(400)
      const ok = await a.post("/webhooks/paypal", pp, { headers: { "content-type": "application/json", "paypal-mock-signature": signPayPalMockPayload(pp) } })
      expect(ok.data.outcome).toBe("processed")
      expect((await a.post("/webhooks/paypal", pp, { headers: { "content-type": "application/json", "paypal-mock-signature": signPayPalMockPayload(pp) } })).data.outcome).toBe("duplicate")

      expect((await call(a.post("/webhooks/shipengine", { resource_type: "API_TRACK" }))).status).toBe(401)
    })

    it("keeps the audit log append-only at the service and database level", async () => {
      const container = getContainer()
      const audit = container.resolve<AuditService>(AUDIT_MODULE)
      const row = await audit.record({ actor_type: "system", actor_id: "test", action: "test.action", entity_type: "test", after: { password: "secret", note: "ok" } })
      expect((row as unknown as { after: Record<string, unknown> }).after.password).toBe("[REDACTED]")
      expect(() => (audit as unknown as { updateAuditLogs: () => void }).updateAuditLogs()).toThrow(/append-only/)
      const pg = container.resolve<{ raw: (sql: string) => Promise<unknown> }>(ContainerRegistrationKeys.PG_CONNECTION)
      await expect(pg.raw(`update audit_log set action = 'tampered'`)).rejects.toThrow(/append-only/)
      await expect(pg.raw(`delete from audit_log`)).rejects.toThrow(/append-only/)
      await expect(pg.raw(`update ledger_entry set amount_minor = 1`)).resolves.toBeDefined() // no rows: trigger is per-row
    })

    it("rate limits shipping quotes", async () => {
      const setup = await setupStore(getContainer())
      const h = { headers: { "x-publishable-api-key": setup.publishable_key } }
      const cart = (await a.post("/store/carts", { region_id: setup.region_ids.us }, h)).data.cart
      const statuses: number[] = []
      for (let i = 0; i < 22; i++) statuses.push((await call(a.post(`/store/carts/${cart.id}/shipping-quotes`, {}, h))).status)
      // 20 allowed per minute (Medusa pre-fills the country from the single-country region), then 429
      expect(statuses).toEqual([...Array(20).fill(200), 429, 429])
    })
  },
})
