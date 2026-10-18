/** Cookie consent: stored in the `haanta_consent` cookie as e.g. "analytics,marketing" or "none". */
export const CONSENT_COOKIE = "haanta_consent"

export interface Consent {
  analytics: boolean
  marketing: boolean
}

export function parseConsent(value: string | null | undefined): Consent | null {
  if (value == null || value === "") return null
  const parts = value.split(",").map((s) => s.trim().toLowerCase())
  return { analytics: parts.includes("analytics"), marketing: parts.includes("marketing") }
}

export function serializeConsent(c: Consent): string {
  const parts = [c.analytics ? "analytics" : null, c.marketing ? "marketing" : null].filter(Boolean)
  return parts.length ? parts.join(",") : "none"
}

/** Read the consent cookie in the browser (it is not HttpOnly: it only records a preference). */
export function readConsentCookie(cookieString: string): Consent | null {
  const match = cookieString.split(/;\s*/).find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
  if (!match) return null
  return parseConsent(decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)))
}
