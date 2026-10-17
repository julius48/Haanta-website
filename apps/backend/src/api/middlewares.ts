/**
 * Route protection map. Order matters: security headers and CSRF first, then authentication,
 * then Haanta guards (roles, MFA, vendor scope), then validation.
 */
import { authenticate, defineMiddlewares, validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework/http"
import { RATE_LIMITS } from "@haanta/core"
import { apiSecurityHeaders, csrfOriginCheck, rateLimit, requestLogger } from "./middlewares/security"
import { enforcePasswordPolicy, loginLockout, requireTurnstile, rotateSession } from "./middlewares/auth-hardening"
import { auditMutations, staffGuard, vendorGuard, vendorPiiGuard } from "./middlewares/guards"
import { guardLineItemMetadata } from "./middlewares/cart"
import * as v from "./validators"

const staff = [authenticate("user", ["session", "bearer"]), staffGuard, auditMutations]
const vendor = [authenticate("vendor", ["bearer", "session"]), vendorGuard, auditMutations]
const vendorUnregistered = [authenticate("vendor", ["bearer"], { allowUnregistered: true })]
const customer = [authenticate("customer", ["bearer", "session"])]
const body = validateAndTransformBody
const query = (schema: Parameters<typeof validateAndTransformQuery>[0]) => validateAndTransformQuery(schema, {})

export default defineMiddlewares({
  routes: [
    // ---------------------------------------------------------------- everywhere
    { matcher: "/*", middlewares: [apiSecurityHeaders, csrfOriginCheck, requestLogger] },

    // ---------------------------------------------------------------- auth (Medusa built-in routes)
    { matcher: "/auth/:actor_type/emailpass", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), requireTurnstile, loginLockout] },
    { matcher: "/auth/:actor_type/emailpass/register", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), requireTurnstile, enforcePasswordPolicy] },
    { matcher: "/auth/:actor_type/emailpass/reset-password", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.passwordReset), requireTurnstile] },
    { matcher: "/auth/:actor_type/emailpass/update", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.passwordReset), enforcePasswordPolicy] },
    { matcher: "/auth/session", method: ["POST"], middlewares: [rotateSession] },

    // ---------------------------------------------------------------- admin (all /admin routes, core + custom)
    { matcher: "/admin/*", middlewares: staff },
    { matcher: "/admin/haanta/mfa/confirm", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), body(v.MfaConfirmBody)] },
    { matcher: "/admin/haanta/mfa/verify", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), body(v.MfaVerifyBody)] },
    { matcher: "/admin/haanta/review-queue/:id/approve", method: ["POST"], middlewares: [body(v.ReviewNoteBody)] },
    { matcher: "/admin/haanta/review-queue/:id/request-changes", method: ["POST"], middlewares: [body(v.RequestChangesBody)] },
    { matcher: "/admin/haanta/review-queue/:id/edit", method: ["POST"], middlewares: [body(v.AdminEditListingBody)] },
    { matcher: "/admin/haanta/vendors/:id/invites", method: ["POST"], middlewares: [body(v.VendorInviteBody)] },
    { matcher: "/admin/haanta/markup/vendors/:id", method: ["POST"], middlewares: [body(v.VendorMarkupBody)] },
    { matcher: "/admin/haanta/markup/categories", method: ["POST"], middlewares: [body(v.CategoryMarkupBody)] },
    { matcher: "/admin/haanta/markup/products", method: ["POST"], middlewares: [body(v.ProductMarkupBody)] },
    { matcher: "/admin/haanta/payouts", method: ["POST"], middlewares: [body(v.RecordPayoutBody)] },
    { matcher: "/admin/haanta/orders/:id/delivered", method: ["POST"], middlewares: [body(v.DeliveredBody)] },
    { matcher: "/admin/haanta/refunds/:order_id", method: ["POST"], middlewares: [body(v.RefundLinesBody)] },
    { matcher: "/admin/haanta/staff-roles", method: ["POST"], middlewares: [body(v.StaffRoleBody)] },
    { matcher: "/admin/haanta/product-reviews/:id", method: ["POST"], middlewares: [body(v.ModerateReviewBody)] },
    { matcher: "/admin/haanta/privacy/delete/:customer_id", method: ["POST"], middlewares: [body(v.PrivacyDeleteBody)] },
    { matcher: "/admin/haanta/audit-log", method: ["GET"], middlewares: [query(v.AuditQuery)] },
    { matcher: "/admin/haanta/orders", method: ["GET"], middlewares: [query(v.AdminOrdersQuery)] },
    { matcher: "/admin/haanta/dashboard", method: ["GET"], middlewares: [query(v.DashboardQuery)] },

    // ---------------------------------------------------------------- vendor portal API
    { matcher: "/vendor/applications", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), ...vendorUnregistered, body(v.VendorApplicationBody)] },
    { matcher: "/vendor/invites/accept", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), ...vendorUnregistered, body(v.AcceptInviteBody)] },
    { matcher: "/vendor/me*", middlewares: vendor },
    { matcher: "/vendor/mfa*", middlewares: vendor },
    { matcher: "/vendor/mfa/confirm", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), body(v.MfaConfirmBody)] },
    { matcher: "/vendor/mfa/verify", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.auth), body(v.MfaVerifyBody)] },
    { matcher: "/vendor/verify-email", method: ["POST"], middlewares: [...vendor, rateLimit(RATE_LIMITS.auth), body(v.VerifyEmailBody)] },
    { matcher: "/vendor/resend-verification", method: ["POST"], middlewares: [...vendor, rateLimit(RATE_LIMITS.passwordReset)] },
    { matcher: "/vendor/store*", middlewares: vendor },
    { matcher: "/vendor/store", method: ["POST"], middlewares: [body(v.StorePageBody)] },
    { matcher: "/vendor/products*", middlewares: vendor },
    { matcher: "/vendor/products", method: ["GET"], middlewares: [query(v.VendorListQuery)] },
    { matcher: "/vendor/products", method: ["POST"], middlewares: [body(v.ListingBody)] },
    { matcher: "/vendor/products/:id", method: ["POST"], middlewares: [body(v.ListingBody)] },
    { matcher: "/vendor/pricing/preview", method: ["POST"], middlewares: [...vendor, body(v.PricePreviewBody)] },
    { matcher: "/vendor/size-charts*", middlewares: vendor },
    { matcher: "/vendor/size-charts", method: ["POST"], middlewares: [body(v.SizeChartBody)] },
    { matcher: "/vendor/size-charts/:id", method: ["POST"], middlewares: [body(v.SizeChartBody)] },
    { matcher: "/vendor/orders*", middlewares: [...vendor, vendorPiiGuard] },
    { matcher: "/vendor/orders", method: ["GET"], middlewares: [query(v.VendorListQuery)] },
    { matcher: "/vendor/orders/:id/status", method: ["POST"], middlewares: [body(v.VendorOrderStatusBody)] },
    { matcher: "/vendor/earnings*", middlewares: [...vendor, vendorPiiGuard] },
    { matcher: "/vendor/earnings/statements/:payout_id", method: ["GET"], middlewares: [query(v.StatementQuery)] },
    { matcher: "/vendor/analytics*", middlewares: [...vendor, vendorPiiGuard] },
    { matcher: "/vendor/uploads/sign", method: ["POST"], middlewares: [...vendor, body(v.UploadSignBody)] },

    // ---------------------------------------------------------------- storefront
    { matcher: "/store/carts/:id/line-items", method: ["POST"], middlewares: [guardLineItemMetadata] },
    { matcher: "/store/carts/:id/line-items/:line_id", method: ["POST"], middlewares: [guardLineItemMetadata] },
    { matcher: "/store/carts/:id/shipping-quotes", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.shippingQuote), body(v.ShippingQuoteBody)] },
    { matcher: "/store/carts/:id/complete", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.checkout)] },
    { matcher: "/store/payment-collections*", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.checkout)] },
    { matcher: "/store/haanta/search", method: ["GET"], middlewares: [rateLimit(RATE_LIMITS.search), query(v.SearchQuery)] },
    { matcher: "/store/haanta/products/:id/reviews", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.reviews), ...customer, body(v.ReviewCreateBody)] },
    { matcher: "/store/haanta/newsletter", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.newsletter), body(v.NewsletterBody)] },
    { matcher: "/store/haanta/tracking", method: ["POST"], middlewares: [rateLimit(RATE_LIMITS.search), body(v.TrackingLookupBody)] },
    { matcher: "/store/haanta/me*", middlewares: customer },

    // ---------------------------------------------------------------- webhooks (raw body for signature checks)
    { matcher: "/webhooks/*", method: ["POST"], bodyParser: { preserveRawBody: true, sizeLimit: "1mb" }, middlewares: [rateLimit(RATE_LIMITS.webhook)] },
    // Signed direct-upload target used when Cloudinary is not configured (local/dev).
    { matcher: "/uploads/local", method: ["POST"], bodyParser: false, middlewares: [rateLimit(RATE_LIMITS.webhook)] },
  ],
})
