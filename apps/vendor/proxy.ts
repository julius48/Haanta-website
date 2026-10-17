import { NextResponse, type NextRequest } from "next/server"
import { buildCsp, generateNonce, securityHeaders } from "@haanta/core/headers"

/**
 * Per-request CSP nonce (no 'unsafe-inline' scripts) and security headers.
 * No payment providers or analytics on the vendor portal.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const path = request.nextUrl.pathname
  const dev = process.env.NODE_ENV !== "production"
  const csp = buildCsp({
    nonce,
    apiOrigin: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000",
    stripe: false,
    paypal: false,
    turnstile: ["/login", "/register", "/reset-password", "/invite"].some((p) => path.startsWith(p)),
    analytics: false,
    dev,
    extraImg: [process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"],
    extraConnect: ["https://api.cloudinary.com"],
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
