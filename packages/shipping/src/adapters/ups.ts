import type { UpsRatedShipment, UpsRatingAdapter, UpsShopRequest } from "../types"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface UpsAdapterConfig {
  clientId: string
  clientSecret: string
  /** UPS account/shipper number. Must come from secrets, never from code. */
  shipperNumber: string
  shipFrom: { name: string; addressLine: string; city: string; state: string; postalCode: string; country: string }
  baseUrl?: string
  fetch?: FetchLike
  now?: () => number
  timeoutMs?: number
}

/** Refresh tokens this long before UPS says they expire. */
const TOKEN_SAFETY_MARGIN_MS = 60_000

interface RawShipment {
  Service?: { Code?: unknown }
  TotalCharges?: { MonetaryValue?: unknown; CurrencyCode?: unknown }
}

/** Parse a UPS Rating API "Shop" response. Throws "Invalid UPS response" like the legacy code. */
export function parseUpsRateResponse(body: unknown): UpsRatedShipment[] {
  const rated = (body as { RateResponse?: { RatedShipment?: RawShipment | RawShipment[] } } | null)?.RateResponse
    ?.RatedShipment
  if (!rated) throw new Error("Invalid UPS response")
  const list = Array.isArray(rated) ? rated : [rated]
  return list.map((s) => {
    const serviceCode = s.Service?.Code
    const value = s.TotalCharges?.MonetaryValue
    const currency = s.TotalCharges?.CurrencyCode
    if (typeof serviceCode !== "string" || typeof value !== "string" || !Number.isFinite(Number(value))) {
      throw new Error("Invalid UPS response")
    }
    return { serviceCode, monetaryValue: value, currency: typeof currency === "string" ? currency : "USD" }
  })
}

export function createUpsRatingAdapter(config: UpsAdapterConfig): UpsRatingAdapter {
  if (!config.clientId || !config.clientSecret || !config.shipperNumber) {
    throw new Error("UPS adapter requires clientId, clientSecret and shipperNumber from secrets")
  }
  const baseUrl = config.baseUrl ?? "https://onlinetools.ups.com"
  const doFetch: FetchLike = config.fetch ?? ((i, init) => fetch(i, init))
  const now = config.now ?? Date.now
  const timeoutMs = config.timeoutMs ?? 8000
  let cached: { token: string; expiresAt: number } | null = null

  async function getToken(): Promise<string> {
    if (cached && now() < cached.expiresAt - TOKEN_SAFETY_MARGIN_MS) return cached.token
    const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")
    const res = await doFetch(`${baseUrl}/security/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
    if (!res.ok || !data || typeof data.access_token !== "string") {
      cached = null
      throw new Error(`UPS token request failed (${res.status})`)
    }
    const expiresInS = Number(data.expires_in) || 0
    cached = { token: data.access_token, expiresAt: now() + expiresInS * 1000 }
    return data.access_token
  }

  return {
    async shop(request: UpsShopRequest) {
      const token = await getToken()
      const d = request.destination
      const body = {
        RateRequest: {
          Request: { RequestOption: "Shop" },
          Shipment: {
            Shipper: {
              Name: config.shipFrom.name,
              ShipperNumber: config.shipperNumber,
              Address: {
                AddressLine: [config.shipFrom.addressLine],
                City: config.shipFrom.city,
                StateProvinceCode: config.shipFrom.state,
                PostalCode: config.shipFrom.postalCode,
                CountryCode: config.shipFrom.country,
              },
            },
            ShipTo: {
              Address: {
                AddressLine: [d.addressLine1 ?? ""],
                City: d.city || config.shipFrom.city,
                StateProvinceCode: d.stateCode,
                PostalCode: d.postalCode ?? "",
                CountryCode: d.country.toUpperCase(),
              },
            },
            Package: request.packages.map((p) => ({
              PackagingType: { Code: "02" },
              PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(p.weightLbs) },
            })),
          },
        },
      }
      const res = await doFetch(`${baseUrl}/api/rating/v1/shop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status === 401) cached = null
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(`UPS rating failed (${res.status})`)
      return parseUpsRateResponse(result)
    },
  }
}
