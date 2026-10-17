import type { ExchangeRateAdapter } from "../types"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ExchangeRateApiConfig {
  url?: string
  fetch?: FetchLike
  /** Cache rates to avoid a network call on every quote. Default 10 minutes. */
  cacheTtlMs?: number
  now?: () => number
}

/** exchangerate-api.com v4 (the endpoint the Wix code used). The engine applies the 1s timeout and fallback. */
export function createExchangeRateApiAdapter(config: ExchangeRateApiConfig = {}): ExchangeRateAdapter {
  const url = config.url ?? "https://api.exchangerate-api.com/v4/latest/USD"
  const doFetch: FetchLike = config.fetch ?? ((i, init) => fetch(i, init))
  const ttl = config.cacheTtlMs ?? 10 * 60_000
  const now = config.now ?? Date.now
  let cache: { at: number; rates: Record<string, unknown> } | null = null

  return {
    async usdTo(currency: string) {
      const c = currency.toUpperCase()
      if (c === "USD") return 1
      if (!cache || now() - cache.at > ttl) {
        const res = await doFetch(url, { headers: { accept: "application/json" } })
        if (!res.ok) throw new Error(`FX request failed (${res.status})`)
        const data = (await res.json()) as { rates?: Record<string, unknown> }
        if (!data?.rates || typeof data.rates !== "object") throw new Error("Invalid FX response")
        cache = { at: now(), rates: data.rates }
      }
      const rate = cache.rates[c]
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw new Error(`No FX rate for ${c}`)
      return rate
    },
  }
}

/** Fixed rates, used as the local mock and in tests. */
export function createFixedExchangeRateAdapter(rates: Record<string, number>): ExchangeRateAdapter {
  return {
    async usdTo(currency: string) {
      const c = currency.toUpperCase()
      if (c === "USD") return 1
      const r = rates[c]
      if (r === undefined) throw new Error(`No FX rate for ${c}`)
      return r
    },
  }
}
