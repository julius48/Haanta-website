/**
 * Security headers and Content Security Policy shared by the Next.js apps and the backend.
 * Scripts use per-request nonces with 'strict-dynamic'; no 'unsafe-inline' for scripts.
 */

export interface CspOptions {
  nonce: string
  /** Backend API origin, e.g. https://api.haanta.com */
  apiOrigin: string
  /** Enable Stripe (js.stripe.com frames and scripts) on checkout pages. */
  stripe?: boolean
  paypal?: boolean
  /** Analytics only after consent. */
  analytics?: boolean
  turnstile?: boolean
  dev?: boolean
  extraConnect?: string[]
  extraImg?: string[]
}

export function buildCsp(o: CspOptions): string {
  const script = [`'self'`, `'nonce-${o.nonce}'`, `'strict-dynamic'`]
  const connect = [`'self'`, o.apiOrigin, ...(o.extraConnect ?? [])]
  const frame: string[] = []
  const img = [`'self'`, "data:", "blob:", "https://res.cloudinary.com", "https://static.wixstatic.com", "https://cdn.sanity.io", ...(o.extraImg ?? [])]
  if (o.dev) script.push(`'unsafe-eval'`)
  if (o.stripe) {
    script.push("https://js.stripe.com")
    connect.push("https://api.stripe.com", "https://m.stripe.network")
    frame.push("https://js.stripe.com", "https://hooks.stripe.com")
    img.push("https://*.stripe.com")
  }
  if (o.paypal) {
    script.push("https://www.paypal.com")
    connect.push("https://www.paypal.com", "https://www.sandbox.paypal.com")
    frame.push("https://www.paypal.com", "https://www.sandbox.paypal.com")
  }
  if (o.turnstile) {
    script.push("https://challenges.cloudflare.com")
    frame.push("https://challenges.cloudflare.com")
  }
  if (o.analytics) {
    script.push("https://www.googletagmanager.com", "https://us-assets.i.posthog.com")
    connect.push("https://www.google-analytics.com", "https://*.google-analytics.com", "https://us.i.posthog.com")
    img.push("https://www.google-analytics.com", "https://www.googletagmanager.com")
  }
  if (o.dev) connect.push("ws:", "http://localhost:*")
  const directives: Record<string, string[]> = {
    "default-src": [`'self'`],
    "script-src": script,
    // Inline style attributes are needed by Next/React; scripts stay nonce-only.
    "style-src": [`'self'`, `'unsafe-inline'`, "https://fonts.googleapis.com"],
    "font-src": [`'self'`, "https://fonts.gstatic.com", "data:"],
    "img-src": img,
    "connect-src": connect,
    "frame-src": frame.length ? frame : [`'none'`],
    "frame-ancestors": [`'none'`],
    "form-action": [`'self'`, ...(o.stripe ? ["https://hooks.stripe.com"] : [])],
    "base-uri": [`'self'`],
    "object-src": [`'none'`],
    "worker-src": [`'self'`, "blob:"],
    "manifest-src": [`'self'`],
  }
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`)
  if (!o.dev) parts.push("upgrade-insecure-requests")
  return parts.join("; ")
}

export function securityHeaders(opts: { hsts?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self \"https://js.stripe.com\")",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Resource-Policy": "same-site",
  }
  if (opts.hsts !== false) h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
  return h
}

/** Generate a CSP nonce (Web Crypto, so it works in the Next.js edge middleware). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: require an Origin (or Referer)
 * header that matches an allowed origin. Combined with SameSite=Lax cookies.
 */
export function isAllowedOrigin(
  method: string,
  headers: { origin?: string | null; referer?: string | null },
  allowed: string[],
): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true
  const source = headers.origin ?? (headers.referer ? safeOrigin(headers.referer) : null)
  if (!source) return false
  return allowed.some((a) => a === source)
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
