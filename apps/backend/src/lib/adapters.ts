/**
 * Third-party adapters. Each service has an interface, a real implementation used when its keys are
 * present, and a deterministic local mock otherwise. Never call real services in tests.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import {
  createExchangeRateApiAdapter,
  createFixedExchangeRateAdapter,
  createMockUpsAdapter,
  createUpsRatingAdapter,
  type ShippingAdapters,
} from "@haanta/shipping"
import { createHibpChecker, createLocalBreachedChecker, redact, type BreachedPasswordChecker } from "@haanta/core"

const env = process.env
const isTest = env.NODE_ENV === "test" || !!env.TEST_TYPE

// ---------------------------------------------------------------- shipping

let shippingAdapters: ShippingAdapters | null = null
export function getShippingAdapters(): ShippingAdapters {
  if (shippingAdapters) return shippingAdapters
  const upsLive = !isTest && env.UPS_CLIENT_ID && env.UPS_CLIENT_SECRET && env.UPS_SHIPPER_NUMBER
  shippingAdapters = {
    ups: upsLive
      ? createUpsRatingAdapter({
          clientId: env.UPS_CLIENT_ID!,
          clientSecret: env.UPS_CLIENT_SECRET!,
          shipperNumber: env.UPS_SHIPPER_NUMBER!,
          baseUrl: env.UPS_BASE_URL || "https://onlinetools.ups.com",
          shipFrom: {
            name: env.UPS_SHIP_FROM_NAME || "Haanta Hub",
            addressLine: env.UPS_SHIP_FROM_ADDRESS || "",
            city: env.UPS_SHIP_FROM_CITY || "Houston",
            state: env.UPS_SHIP_FROM_STATE || "TX",
            postalCode: env.UPS_SHIP_FROM_POSTAL || "",
            country: "US",
          },
        })
      : createMockUpsAdapter(),
    fx: !isTest && env.FX_PROVIDER === "exchangerate-api" ? createExchangeRateApiAdapter() : createFixedExchangeRateAdapter({ NGN: 1500, CAD: 1.37 }),
  }
  return shippingAdapters
}
export function setShippingAdaptersForTest(a: ShippingAdapters | null) {
  shippingAdapters = a
}

// ---------------------------------------------------------------- passwords

export function getBreachedPasswordChecker(): BreachedPasswordChecker {
  return !isTest && env.HIBP_ENABLED !== "false" && env.NODE_ENV === "production" ? createHibpChecker() : createLocalBreachedChecker()
}

// ---------------------------------------------------------------- Turnstile

export interface TurnstileVerifier {
  verify(token: string | undefined, ip?: string): Promise<boolean>
}

export function getTurnstileVerifier(): TurnstileVerifier {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret || isTest) {
    // Local mock: any non-empty token passes except the literal "fail" (used by tests).
    return { verify: async (t) => !!t && t !== "fail" }
  }
  return {
    async verify(token, ip) {
      if (!token) return false
      const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) })
      try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) })
        const data = (await res.json()) as { success?: boolean }
        return data.success === true
      } catch {
        return false
      }
    },
  }
}

// ---------------------------------------------------------------- Klaviyo (email + SMS)

export interface OutboundMessage {
  /** Klaviyo metric / flow trigger name, e.g. "Order Placed". */
  event: string
  to: { email?: string; phone?: string }
  audience: "buyer" | "vendor" | "staff"
  properties: Record<string, unknown>
}

export interface Messenger {
  send(msg: OutboundMessage): Promise<void>
  subscribe(email: string, listKey: "newsletter"): Promise<void>
}

/** In-memory outbox used by the mock messenger; tests inspect it. */
export const outbox: OutboundMessage[] = []
export const newsletterList: string[] = []

export function getMessenger(logger?: { info: (m: string) => void }): Messenger {
  const key = env.KLAVIYO_PRIVATE_KEY
  if (!key || isTest) {
    return {
      async send(msg) {
        outbox.push(msg)
        logger?.info(`[mock-klaviyo] ${msg.event} → ${JSON.stringify(redact(msg.to))}`)
      },
      async subscribe(email) {
        if (!newsletterList.includes(email)) newsletterList.push(email)
      },
    }
  }
  const headers = { Authorization: `Klaviyo-API-Key ${key}`, revision: "2025-07-15", "content-type": "application/json", accept: "application/json" }
  return {
    async send(msg) {
      await fetch("https://a.klaviyo.com/api/events", {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "event",
            attributes: {
              properties: msg.properties,
              metric: { data: { type: "metric", attributes: { name: msg.event } } },
              profile: { data: { type: "profile", attributes: { email: msg.to.email, phone_number: msg.to.phone } } },
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
      })
    },
    async subscribe(email) {
      const listId = env.KLAVIYO_NEWSLETTER_LIST_ID
      if (!listId) return
      await fetch("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "profile-subscription-bulk-create-job",
            attributes: { profiles: { data: [{ type: "profile", attributes: { email, subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } } } }] } },
            relationships: { list: { data: { type: "list", id: listId } } },
          },
        }),
        signal: AbortSignal.timeout(8000),
      })
    },
  }
}

// ---------------------------------------------------------------- Cloudinary signed uploads

export interface UploadSignature {
  provider: "cloudinary" | "local"
  upload_url: string
  fields: Record<string, string>
  expires_at: string
}

export interface ImageUploads {
  /** Sign a direct upload for an authenticated actor into a fixed folder. */
  sign(input: { folder: string; publicId: string; contentType: string; size: number }): UploadSignature
}

export function getImageUploads(): ImageUploads {
  const cloud = env.CLOUDINARY_CLOUD_NAME
  const apiKey = env.CLOUDINARY_API_KEY
  const apiSecret = env.CLOUDINARY_API_SECRET
  if (cloud && apiKey && apiSecret && !isTest) {
    return {
      sign({ folder, publicId }) {
        const timestamp = Math.floor(Date.now() / 1000)
        // The upload preset (configured in Cloudinary) restricts formats to jpg/png/webp, max size,
        // strips metadata (EXIF) and rejects SVG. Parameters below are signed so they can't be changed.
        const params: Record<string, string> = {
          folder,
          public_id: publicId,
          timestamp: String(timestamp),
          upload_preset: env.CLOUDINARY_UPLOAD_PRESET || "haanta_signed",
        }
        const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&")
        const signature = createHmac("sha256", apiSecret).update(toSign).digest("hex")
        return {
          provider: "cloudinary",
          upload_url: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
          fields: { ...params, api_key: apiKey, signature, signature_algorithm: "sha256" },
          expires_at: new Date((timestamp + 3600) * 1000).toISOString(),
        }
      },
    }
  }
  return {
    sign({ folder, publicId, contentType, size }) {
      const expires = Date.now() + 10 * 60_000
      const payload = `${folder}|${publicId}|${contentType}|${size}|${expires}`
      return {
        provider: "local",
        upload_url: `${env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/uploads/local`,
        fields: { folder, public_id: publicId, content_type: contentType, size: String(size), expires: String(expires), signature: localUploadSignature(payload) },
        expires_at: new Date(expires).toISOString(),
      }
    },
  }
}

export function localUploadSignature(payload: string): string {
  return createHmac("sha256", env.UPLOAD_SIGNING_SECRET || env.COOKIE_SECRET || "dev-upload-secret").update(payload).digest("hex")
}

export function verifyLocalUploadSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(localUploadSignature(payload))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

// ---------------------------------------------------------------- ShipEngine (labels + tracking)

export interface TrackingEvent {
  status: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception"
  description: string
  occurred_at: string
  location?: string
}

export interface LabelsAndTracking {
  track(carrier: string, trackingNumber: string): Promise<TrackingEvent[]>
  createLabel(input: { carrier: string; service: string; weightKg: number; toCountry: string; toPostal: string }): Promise<{ tracking_number: string; label_url: string }>
}

export function getLabelsAndTracking(): LabelsAndTracking {
  const key = env.SHIPENGINE_API_KEY
  if (!key || isTest) {
    return {
      async track(_carrier, trackingNumber) {
        // Deterministic mock: numbers ending in "D" are delivered.
        const delivered = trackingNumber.toUpperCase().endsWith("D")
        const base = [{ status: "label_created" as const, description: "Shipping label created", occurred_at: "2026-10-01T10:00:00Z" }]
        return delivered
          ? [...base, { status: "in_transit" as const, description: "In transit", occurred_at: "2026-10-02T10:00:00Z" }, { status: "delivered" as const, description: "Delivered", occurred_at: "2026-10-04T15:00:00Z" }]
          : [...base, { status: "in_transit" as const, description: "In transit", occurred_at: "2026-10-02T10:00:00Z" }]
      },
      async createLabel() {
        const n = `MOCK${Date.now().toString(36).toUpperCase()}`
        return { tracking_number: n, label_url: `https://example.invalid/labels/${n}.pdf` }
      },
    }
  }
  const headers = { "API-Key": key, "content-type": "application/json" }
  return {
    async track(carrier, trackingNumber) {
      const url = `https://api.shipengine.com/v1/tracking?carrier_code=${encodeURIComponent(carrier)}&tracking_number=${encodeURIComponent(trackingNumber)}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`ShipEngine tracking failed (${res.status})`)
      const data = (await res.json()) as { events?: { status_code?: string; description?: string; occurred_at?: string; city_locality?: string }[] }
      const map: Record<string, TrackingEvent["status"]> = { AC: "label_created", IT: "in_transit", OD: "out_for_delivery", DE: "delivered", EX: "exception" }
      return (data.events ?? []).map((e) => ({
        status: map[e.status_code ?? ""] ?? "in_transit",
        description: e.description ?? "",
        occurred_at: e.occurred_at ?? new Date().toISOString(),
        location: e.city_locality,
      }))
    },
    async createLabel() {
      throw new Error("Label creation is configured per carrier account in ShipEngine; see docs/runbook.md")
    },
  }
}
