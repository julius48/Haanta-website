/**
 * PostHog + GA4 events (client only). Does nothing unless the shopper consented to analytics AND
 * the matching public key is configured. Never sends emails, names, phone numbers or addresses.
 */
import { readConsentCookie } from "./consent"

export type AnalyticsEvent = "view_item" | "add_to_cart" | "begin_checkout" | "purchase"

export interface AnalyticsItem {
  item_id: string
  item_name?: string
  item_brand?: string
  item_variant?: string
  price?: number
  quantity?: number
}

export interface AnalyticsParams {
  currency?: string
  value?: number
  transaction_id?: string
  items?: AnalyticsItem[]
}

type Gtag = (...args: unknown[]) => void
interface PostHogLike {
  capture: (event: string, props?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
    posthog?: PostHogLike | unknown[]
  }
}

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? ""
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ""
export const POSTHOG_HOST = "https://us.i.posthog.com"

const PII_KEY = /(e-?mail|address|phone|first_?name|last_?name|full_?name|postal|zip|street|city|province)/i
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/

/** Remove anything that could identify a person. Exported for tests. */
export function scrubParams(params: AnalyticsParams): Record<string, unknown> {
  const scrub = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (PII_KEY.test(k)) continue
      if (typeof v === "string") {
        if (EMAIL_VALUE.test(v)) continue
        out[k] = v.slice(0, 200)
      } else if (typeof v === "number" || typeof v === "boolean") out[k] = v
      else if (Array.isArray(v)) out[k] = v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null).slice(0, 50).map(scrub)
    }
    return out
  }
  return scrub(params as Record<string, unknown>)
}

export function analyticsAllowed(): boolean {
  if (typeof document === "undefined") return false
  if (!GA4_ID && !POSTHOG_KEY) return false
  return readConsentCookie(document.cookie)?.analytics === true
}

export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (!analyticsAllowed()) return
  const clean = scrubParams(params)
  try {
    if (GA4_ID && typeof window.gtag === "function") window.gtag("event", event, clean)
    const ph = window.posthog
    if (POSTHOG_KEY && ph && !Array.isArray(ph) && typeof (ph as PostHogLike).capture === "function") (ph as PostHogLike).capture(event, clean)
  } catch {
    // analytics must never break the shop
  }
}

/** Load GA4 / PostHog scripts once consent is given. Called by <AnalyticsLoader>. */
export function loadAnalytics(): void {
  if (!analyticsAllowed()) return
  if (GA4_ID && !document.getElementById("haanta-ga4")) {
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args)
    }
    window.gtag("js", new Date())
    window.gtag("config", GA4_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false })
    const s = document.createElement("script")
    s.id = "haanta-ga4"
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`
    document.head.appendChild(s)
  }
  if (POSTHOG_KEY && !document.getElementById("haanta-posthog")) {
    const stub: unknown[] & { _i?: unknown[]; __SV?: number } = []
    stub._i = [[POSTHOG_KEY, { api_host: POSTHOG_HOST, autocapture: false, capture_pageview: true, disable_session_recording: true, persistence: "localStorage" }, "posthog"]]
    stub.__SV = 1
    window.posthog = stub
    const s = document.createElement("script")
    s.id = "haanta-posthog"
    s.async = true
    s.src = "https://us-assets.i.posthog.com/static/array.js"
    document.head.appendChild(s)
  }
}
