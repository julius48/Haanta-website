import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { hitRateLimit, isAllowedOrigin, redact, securityHeaders, type RateLimitRule } from "@haanta/core"
import { getCounterStore } from "../../lib/counter-store"
import { clientIp } from "../../lib/http"

const isProd = process.env.NODE_ENV === "production"

/** Security headers on every API response. JSON APIs never need to be framed or run scripts. */
export function apiSecurityHeaders(_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  for (const [k, v] of Object.entries(securityHeaders({ hsts: isProd }))) res.setHeader(k, v)
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  res.setHeader("Cache-Control", "no-store")
  next()
}

function allowedOrigins(): string[] {
  return [process.env.STORE_CORS, process.env.ADMIN_CORS, process.env.AUTH_CORS, process.env.VENDOR_CORS]
    .filter(Boolean)
    .flatMap((s) => s!.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * CSRF: state-changing requests authenticated by cookie must come from one of our own origins.
 * Requests with a bearer token or a publishable key header are not cookie-authenticated.
 */
export function csrfOriginCheck(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const usesCookie = !!req.headers.cookie && !req.headers.authorization
  if (!usesCookie) return next()
  if (isAllowedOrigin(req.method, { origin: req.headers.origin, referer: req.headers.referer }, allowedOrigins())) return next()
  res.status(403).json({ type: "not_allowed", code: "csrf_origin", message: "Cross-site request blocked" })
}

export function rateLimit(rule: RateLimitRule, key: (req: MedusaRequest) => string = (req) => clientIp(req)) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const r = await hitRateLimit(getCounterStore(), rule, key(req))
    res.setHeader("RateLimit-Limit", String(rule.limit))
    res.setHeader("RateLimit-Remaining", String(r.remaining))
    if (!r.allowed) {
      res.setHeader("Retry-After", String(r.retryAfterS))
      res.status(429).json({ type: "too_many_requests", message: "Too many requests. Please try again shortly." })
      return
    }
    next()
  }
}

/** Log every state-changing request outcome with secrets redacted (the audit log covers who/what). */
export function requestLogger(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (req.method !== "GET") {
    const started = Date.now()
    res.on("finish", () => {
      if (res.statusCode >= 500) {
        const logger = req.scope.resolve("logger") as { error: (m: string) => void }
        logger.error(`[http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms ${JSON.stringify(redact({ query: req.query }))}`)
      }
    })
  }
  next()
}
