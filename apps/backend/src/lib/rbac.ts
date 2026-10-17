import type { StaffRole } from "../modules/security"

/**
 * Haanta staff sub-roles. Least privilege: anything not listed below is admin-only.
 *
 *   admin            everything
 *   catalog_reviewer review queue, products/catalog, product reviews, vendors (read)
 *   finance          payouts, ledger, reconciliation, markup and pricing settings, refunds, orders (read)
 *   support          orders, customers, returns, tracking, privacy export
 */
type Rule = { prefix: string; methods?: "read" | "all"; roles: StaffRole[] }

const READ = new Set(["GET", "HEAD", "OPTIONS"])

const RULES: Rule[] = [
  // Haanta custom admin API
  { prefix: "/admin/haanta/dashboard", methods: "read", roles: ["finance", "support", "catalog_reviewer"] },
  { prefix: "/admin/haanta/review-queue", roles: ["catalog_reviewer"] },
  { prefix: "/admin/haanta/catalog-health", methods: "read", roles: ["catalog_reviewer"] },
  { prefix: "/admin/haanta/product-reviews", roles: ["catalog_reviewer", "support"] },
  { prefix: "/admin/haanta/vendors", methods: "read", roles: ["catalog_reviewer", "finance", "support"] },
  { prefix: "/admin/haanta/payouts", roles: ["finance"] },
  { prefix: "/admin/haanta/ledger", methods: "read", roles: ["finance"] },
  { prefix: "/admin/haanta/reconciliation", methods: "read", roles: ["finance"] },
  { prefix: "/admin/haanta/markup", roles: ["finance"] },
  { prefix: "/admin/haanta/settings/pricing", roles: ["finance"] },
  { prefix: "/admin/haanta/settings", methods: "read", roles: ["finance", "catalog_reviewer", "support"] },
  { prefix: "/admin/haanta/orders", methods: "read", roles: ["finance", "support"] },
  { prefix: "/admin/haanta/orders/", roles: ["support"] },
  { prefix: "/admin/haanta/refunds", roles: ["finance"] },
  { prefix: "/admin/haanta/privacy/export", roles: ["support"] },
  { prefix: "/admin/haanta/abandoned-carts", methods: "read", roles: ["support"] },
  { prefix: "/admin/haanta/audit-log", methods: "read", roles: [] },
  // Medusa core admin API
  { prefix: "/admin/products", roles: ["catalog_reviewer"] },
  { prefix: "/admin/product-categories", roles: ["catalog_reviewer"] },
  { prefix: "/admin/product-tags", roles: ["catalog_reviewer"] },
  { prefix: "/admin/product-types", roles: ["catalog_reviewer"] },
  { prefix: "/admin/collections", roles: ["catalog_reviewer"] },
  { prefix: "/admin/inventory-items", roles: ["catalog_reviewer", "support"] },
  { prefix: "/admin/orders", methods: "read", roles: ["finance", "support"] },
  { prefix: "/admin/orders", roles: ["support"] },
  { prefix: "/admin/returns", roles: ["support"] },
  { prefix: "/admin/exchanges", roles: ["support"] },
  { prefix: "/admin/claims", roles: ["support"] },
  { prefix: "/admin/customers", roles: ["support"] },
  { prefix: "/admin/customer-groups", methods: "read", roles: ["support"] },
  { prefix: "/admin/payments", roles: ["finance"] },
  { prefix: "/admin/payment-collections", roles: ["finance"] },
  { prefix: "/admin/refund-reasons", methods: "read", roles: ["finance", "support"] },
  { prefix: "/admin/return-reasons", methods: "read", roles: ["support"] },
  { prefix: "/admin/price-lists", methods: "read", roles: ["finance", "catalog_reviewer"] },
  { prefix: "/admin/promotions", methods: "read", roles: ["finance"] },
  { prefix: "/admin/stock-locations", methods: "read", roles: ["catalog_reviewer", "support"] },
  { prefix: "/admin/sales-channels", methods: "read", roles: ["catalog_reviewer"] },
  { prefix: "/admin/regions", methods: "read", roles: ["finance", "support", "catalog_reviewer"] },
  { prefix: "/admin/currencies", methods: "read", roles: ["finance", "support", "catalog_reviewer"] },
  { prefix: "/admin/shipping-profiles", methods: "read", roles: ["catalog_reviewer"] },
  { prefix: "/admin/uploads", roles: ["catalog_reviewer"] },
]

/** Read-only endpoints every signed-in staff member needs for the dashboard shell, even before MFA. */
export const STAFF_BOOTSTRAP_PATHS = [
  "/admin/users/me",
  "/admin/stores",
  "/admin/feature-flags",
  "/admin/plugins",
  "/admin/notifications",
  "/admin/views",
  "/admin/locales",
  "/admin/haanta/me",
  "/admin/haanta/mfa",
]

export function isBootstrapPath(method: string, path: string): boolean {
  if (path.startsWith("/admin/haanta/mfa")) return true
  return READ.has(method.toUpperCase()) && STAFF_BOOTSTRAP_PATHS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))
}

export function isAllowed(role: StaffRole | null, method: string, path: string): boolean {
  if (!role) return false
  if (role === "admin") return true
  if (isBootstrapPath(method, path)) return true
  const read = READ.has(method.toUpperCase())
  return RULES.some((r) => path.startsWith(r.prefix) && (r.methods !== "read" || read) && r.roles.includes(role))
}
