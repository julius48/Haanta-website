import { NextResponse, type NextRequest } from "next/server"
import { buildCsp, generateNonce, securityHeaders } from "@haanta/core/headers"

/**
 * Per-request CSP nonce (no 'unsafe-inline' scripts) and security headers.
 * Stripe/PayPal are only allowed on checkout pages; analytics only after cookie consent.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const path = request.nextUrl.pathname
  const dev = process.env.NODE_ENV !== "production"
  const consent = request.cookies.get("haanta_consent")?.value ?? ""
  const csp = buildCsp({
    nonce,
    apiOrigin: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000",
    stripe: path.startsWith("/checkout"),
    paypal: path.startsWith("/checkout"),
    turnstile: path.startsWith("/account") || path.startsWith("/checkout"),
    analytics: consent.includes("analytics"),
    dev,
    extraImg: [process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"],
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  for (const [k, v] of Object.entries(securityHeaders({ hsts: !dev }))) response.headers.set(k, v)
  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
