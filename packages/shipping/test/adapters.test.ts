import { describe, expect, it, vi } from "vitest"
import { createUpsRatingAdapter, parseUpsRateResponse } from "../src/adapters/ups"
import { createExchangeRateApiAdapter, createFixedExchangeRateAdapter } from "../src/adapters/fx"
import { createMockUpsAdapter } from "../src/adapters/mock"
import { fixture } from "./helpers"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  shipperNumber: "TEST01",
  shipFrom: { name: "Haanta Hub", addressLine: "1 Test St", city: "Houston", state: "TX", postalCode: "77001", country: "US" },
}

const request = {
  destination: { country: "US", subdivision: "AK", stateCode: "AK", city: "Anchorage", postalCode: "99501", addressLine1: "1 Main" },
  packages: [{ weightLbs: 5 }],
}

describe("UPS rating adapter", () => {
  it("fetches an OAuth token, then rates with it", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).includes("/oauth/token") ? json(fixture("ups-oauth-token.json")) : json(fixture("ups-shop-us.json")),
    )
    const ups = createUpsRatingAdapter({ ...config, fetch })
    const rates = await ups.shop(request)
    expect(rates.map((r) => r.serviceCode)).toEqual(["03", "02", "01"])

    const [tokenUrl, tokenInit] = fetch.mock.calls[0]!
    expect(String(tokenUrl)).toBe("https://onlinetools.ups.com/security/v1/oauth/token")
    expect((tokenInit!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
    )
    expect(tokenInit!.body).toBe("grant_type=client_credentials")

    const [rateUrl, rateInit] = fetch.mock.calls[1]!
    expect(String(rateUrl)).toBe("https://onlinetools.ups.com/api/rating/v1/shop")
    expect((rateInit!.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token-1")
    const body = JSON.parse(String(rateInit!.body))
    expect(body.RateRequest.Request.RequestOption).toBe("Shop")
    expect(body.RateRequest.Shipment.Shipper.ShipperNumber).toBe("TEST01")
    expect(body.RateRequest.Shipment.ShipTo.Address).toEqual({
      AddressLine: ["1 Main"],
      City: "Anchorage",
      StateProvinceCode: "AK",
      PostalCode: "99501",
      CountryCode: "US",
    })
    expect(body.RateRequest.Shipment.Package).toEqual([
      { PackagingType: { Code: "02" }, PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "5" } },
    ])
  })

  it("caches the token until it expires", async () => {
    let now = 1_000_000
    let tokens = 0
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/oauth/token")) {
        tokens++
        return json({ access_token: `t${tokens}`, expires_in: "100" })
      }
      return json(fixture("ups-shop-us.json"))
    })
    const ups = createUpsRatingAdapter({ ...config, fetch, now: () => now })
    await ups.shop(request)
    await ups.shop(request)
    expect(tokens).toBe(1)
    now += 95_000 // within the 60s safety margin of expiry → refresh
    await ups.shop(request)
    expect(tokens).toBe(2)
  })

  it("throws on UPS error responses so the engine falls back", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/oauth/token") ? json(fixture("ups-oauth-token.json")) : json(fixture("ups-error.json"), 400),
    )
    await expect(createUpsRatingAdapter({ ...config, fetch }).shop(request)).rejects.toThrow()
  })

  it("throws when the token request fails", async () => {
    const fetch = vi.fn(async () => json({ response: { errors: [{ code: "250002" }] } }, 401))
    await expect(createUpsRatingAdapter({ ...config, fetch }).shop(request)).rejects.toThrow(/token/i)
  })

  it("parses a single (non-array) RatedShipment", () => {
    expect(parseUpsRateResponse(fixture("ups-shop-single.json"))).toEqual([
      { serviceCode: "12", monetaryValue: "61.05", currency: "USD" },
    ])
  })

  it("rejects responses without RatedShipment", () => {
    expect(() => parseUpsRateResponse({ RateResponse: {} })).toThrow(/Invalid UPS response/)
  })

  it("requires credentials", () => {
    expect(() => createUpsRatingAdapter({ ...config, clientId: "" })).toThrow()
  })
})

describe("exchange rate adapters", () => {
  it("reads a rate from exchangerate-api", async () => {
    const fetch = vi.fn(async () => json(fixture("fx-exchangerate-api.json")))
    const fx = createExchangeRateApiAdapter({ fetch })
    expect(await fx.usdTo("NGN")).toBe(1532.4)
    expect(await fx.usdTo("CAD")).toBe(1.37)
    expect(fetch).toHaveBeenCalledWith("https://api.exchangerate-api.com/v4/latest/USD", expect.anything())
  })

  it("caches rates for the configured TTL", async () => {
    let now = 0
    const fetch = vi.fn(async () => json(fixture("fx-exchangerate-api.json")))
    const fx = createExchangeRateApiAdapter({ fetch, cacheTtlMs: 1000, now: () => now })
    await fx.usdTo("NGN")
    await fx.usdTo("CAD")
    expect(fetch).toHaveBeenCalledTimes(1)
    now = 2000
    await fx.usdTo("NGN")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("throws on missing or invalid rates", async () => {
    const fetch = vi.fn(async () => json({ rates: { NGN: "abc" } }))
    await expect(createExchangeRateApiAdapter({ fetch }).usdTo("NGN")).rejects.toThrow()
    await expect(createExchangeRateApiAdapter({ fetch }).usdTo("EUR")).rejects.toThrow()
  })

  it("fixed adapter returns configured rates", async () => {
    const fx = createFixedExchangeRateAdapter({ NGN: 1400 })
    expect(await fx.usdTo("NGN")).toBe(1400)
    expect(await fx.usdTo("USD")).toBe(1)
  })
})

describe("mock UPS adapter", () => {
  it("returns deterministic rates based on weight and destination", async () => {
    const ups = createMockUpsAdapter()
    const a = await ups.shop(request)
    const b = await ups.shop(request)
    expect(a).toEqual(b)
    expect(a[0]!.serviceCode).toBe("03")
    const ca = await ups.shop({ ...request, destination: { ...request.destination, country: "CA", stateCode: "ON" } })
    expect(ca[0]!.serviceCode).toBe("11")
  })
})
