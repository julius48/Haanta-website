import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const isProd = process.env.NODE_ENV === "production"
const redisUrl = process.env.REDIS_URL

function required(name: string, devDefault: string): string {
  const v = process.env[name]
  if (v) return v
  if (isProd) throw new Error(`${name} must be set in production`)
  return devDefault
}

/**
 * Third-party services are adapters selected by env. With no keys, local mocks are used so the whole
 * system runs and every test passes offline. See src/lib/env.ts.
 */
const stripeEnabled = !!process.env.STRIPE_API_KEY
const paypalEnabled = !!process.env.PAYPAL_CLIENT_ID

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: isProd ? { connection: { ssl: { rejectUnauthorized: true } } } : undefined,
    redisUrl,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: required("STORE_CORS", "http://localhost:3000"),
      adminCors: required("ADMIN_CORS", "http://localhost:9000"),
      authCors: required("AUTH_CORS", "http://localhost:3000,http://localhost:3001,http://localhost:9000"),
      jwtSecret: required("JWT_SECRET", "dev-only-jwt-secret-change-me"),
      cookieSecret: required("COOKIE_SECRET", "dev-only-cookie-secret-change-me"),
      // Bearer tokens (storefront and vendor portal servers) expire after 12 hours.
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
      authMethodsPerActor: {
        user: ["emailpass"],
        customer: ["emailpass"],
        vendor: ["emailpass"],
      },
    },
    // Admin dashboard sessions: HttpOnly, Secure in production, SameSite=Lax, 4 hours.
    cookieOptions: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 4 * 60 * 60 * 1000,
    },
    sessionOptions: {
      name: "haanta.sid",
      ttl: 4 * 60 * 60 * 1000,
    },
  },
  admin: {
    // The admin dashboard is served on its own subdomain (admin.haanta.com) in staging/production.
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
  },
  modules: [
    { resolve: "./src/modules/haanta-settings" },
    { resolve: "./src/modules/audit" },
    { resolve: "./src/modules/marketplace" },
    { resolve: "./src/modules/ledger" },
    { resolve: "./src/modules/security" },
    { resolve: "./src/modules/reviews" },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
          { resolve: "./src/modules/haanta-shipping", id: "haanta" },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/payment-stripe",
            id: "stripe",
            options: { mode: stripeEnabled ? "live" : "mock" },
          },
          {
            resolve: "./src/modules/payment-paypal",
            id: "paypal",
            options: { mode: paypalEnabled ? "live" : "mock" },
          },
        ],
      },
    },
    ...(redisUrl
      ? [
          { resolve: "@medusajs/medusa/cache-redis", key: Modules.CACHE, options: { redisUrl } },
          { resolve: "@medusajs/medusa/event-bus-redis", key: Modules.EVENT_BUS, options: { redisUrl } },
          { resolve: "@medusajs/medusa/workflow-engine-redis", key: Modules.WORKFLOW_ENGINE, options: { redis: { url: redisUrl } } },
          { resolve: "@medusajs/medusa/locking", key: Modules.LOCKING, options: { providers: [{ resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } }] } },
        ]
      : []),
  ],
})
