import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../modules/marketplace"
import { SECURITY_MODULE, type SecurityService } from "../../modules/security"
import { isAllowed, isBootstrapPath } from "../../lib/rbac"
import { isLoginVerified } from "../../lib/mfa"
import { audit, type AnyRequest } from "../../lib/http"
import { redact } from "@haanta/core"

const deny = (res: MedusaResponse, status: number, code: string, message: string) => res.status(status).json({ type: "not_allowed", code, message })

/** Paths under /admin that Medusa reaches before an admin account exists (invite acceptance). */
const ADMIN_PUBLIC = ["/admin/invites/accept"]

/**
 * Haanta staff guard for every /admin route (Medusa core and custom):
 * staff role required, route allowed for that role, and the login must have passed TOTP.
 */
export async function staffGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const r = req as AnyRequest
  if (ADMIN_PUBLIC.some((p) => req.path.startsWith(p))) return next()
  const ctx = r.auth_context
  if (!ctx?.actor_id || ctx.actor_type !== "user") return deny(res, 401, "unauthorized", "Sign in required")
  const role = await req.scope.resolve<SecurityService>(SECURITY_MODULE).getRole(ctx.actor_id)
  if (!role) return deny(res, 403, "no_staff_role", "Your account has no Haanta staff role")
  r.staffRole = role
  if (!isAllowed(role, req.method, req.path)) return deny(res, 403, "forbidden_role", "Your role does not allow this action")
  if (!isBootstrapPath(req.method, req.path) && !(await isLoginVerified(req, "user", ctx.actor_id))) {
    return deny(res, 403, "mfa_required", "Verify with your authenticator app to continue")
  }
  next()
}

/** Vendor routes reachable before MFA / email verification / approval. */
const VENDOR_PRE_MFA = ["/vendor/mfa", "/vendor/me"]
const VENDOR_PRE_VERIFY = [...VENDOR_PRE_MFA, "/vendor/verify-email", "/vendor/resend-verification"]
/** While a vendor is pending approval: profile, store page, size charts and drafts are allowed. */
const PENDING_ALLOWED = ["/vendor/store", "/vendor/size-charts", "/vendor/products", "/vendor/pricing/preview", "/vendor/uploads"]
/** While paused: read-only, except fulfilling existing orders. */
const PAUSED_WRITE_ALLOWED = ["/vendor/orders"]

/**
 * Vendor guard: resolves the vendor user → vendor from the token, then enforces MFA, verified
 * email and vendor status. Every vendor handler reads the vendor id from req.vendorContext only.
 */
export async function vendorGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const r = req as AnyRequest
  const ctx = r.auth_context
  if (!ctx?.actor_id || ctx.actor_type !== "vendor") return deny(res, 401, "unauthorized", "Sign in required")
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [user] = await marketplace.listVendorUsers({ id: ctx.actor_id }, { relations: ["vendor"] })
  if (!user?.vendor) return deny(res, 401, "unauthorized", "Vendor account not found")
  r.vendorContext = {
    vendor_id: user.vendor.id,
    vendor_user_id: user.id,
    vendor_status: user.vendor.status as "pending" | "active" | "paused" | "rejected",
    email_verified: !!user.email_verified_at,
  }
  const path = req.path
  const starts = (list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`))
  if (!starts(VENDOR_PRE_MFA) && !(await isLoginVerified(req, "vendor", user.id))) {
    return deny(res, 403, "mfa_required", "Verify with your authenticator app to continue")
  }
  if (!starts(VENDOR_PRE_VERIFY) && !r.vendorContext.email_verified) {
    return deny(res, 403, "email_unverified", "Verify your email address to continue")
  }
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method)
  const status = r.vendorContext.vendor_status
  if (status === "rejected") return deny(res, 403, "vendor_rejected", "This vendor account is not active")
  if (status === "pending" && write && !starts([...VENDOR_PRE_VERIFY, ...PENDING_ALLOWED])) {
    return deny(res, 403, "vendor_pending", "Your store is awaiting Haanta approval")
  }
  if (status === "paused" && write && !starts([...VENDOR_PRE_VERIFY, ...PAUSED_WRITE_ALLOWED])) {
    return deny(res, 403, "vendor_paused", "Your store is paused. Contact Haanta to reactivate it.")
  }
  next()
}

const BUYER_PII_KEYS = /"(email|phone|first_name|last_name|shipping_address|billing_address|customer|address_1|address_2)"\s*:/

/**
 * Defence in depth on vendor order, ledger, payout and analytics responses: if a buyer-PII field ever
 * appears, the response is blocked and logged instead of being sent.
 */
export function vendorPiiGuard(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const original = res.json.bind(res)
  res.json = ((body: unknown) => {
    const text = JSON.stringify(body ?? null)
    if (BUYER_PII_KEYS.test(text)) {
      const logger = req.scope.resolve("logger") as { error: (m: string) => void }
      logger.error(`[security] blocked vendor response containing buyer PII fields on ${req.method} ${req.path}`)
      res.status(500)
      return original({ type: "unexpected_state", message: "Response blocked" })
    }
    return original(body)
  }) as typeof res.json
  next()
}

/** Audit every state-changing admin and vendor request: who, what, when (bodies redacted). */
export function auditMutations(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next()
  res.on("finish", () => {
    if (res.statusCode >= 400) return
    const r = req as AnyRequest
    void audit(r, {
      action: `http.${req.method}`,
      entity_type: "route",
      entity_id: req.originalUrl?.split("?")[0] ?? req.path,
      after: { body: redact(req.body ?? null), status: res.statusCode, vendor_id: r.vendorContext?.vendor_id ?? null },
    }).catch(() => undefined)
  })
  next()
}
