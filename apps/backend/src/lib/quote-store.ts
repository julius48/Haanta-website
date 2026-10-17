/**
 * Short-lived store of server-computed shipping quotes, keyed by cart. The quote endpoint writes
 * here; the fulfilment provider reads it in calculatePrice so the buyer only ever chooses an option
 * code and never supplies an amount. A fingerprint of items, prices and address ties a quote to the
 * exact cart it was computed for.
 */
import { createHash } from "node:crypto"
import type { ShippingOption } from "@haanta/shipping"
import Redis from "ioredis"

export interface StoredQuote {
  cart_id: string
  fingerprint: string
  currency: string
  options: ShippingOption[]
  origin: string | null
  computed_at: string
}

export interface FingerprintInput {
  items: { variant_id?: string | null; quantity: number | string; unit_price: number | string | { toString(): string } }[]
  address: { country_code?: string | null; province?: string | null; postal_code?: string | null } | null | undefined
  currency: string
}

export function cartFingerprint(input: FingerprintInput): string {
  const items = input.items
    .map((i) => `${i.variant_id ?? ""}:${Number(i.quantity)}:${Number(String(i.unit_price)).toFixed(2)}`)
    .sort()
    .join("|")
  const a = input.address
  const addr = `${(a?.country_code ?? "").toUpperCase()}:${(a?.province ?? "").toUpperCase()}:${(a?.postal_code ?? "").replace(/\s/g, "").toUpperCase()}`
  return createHash("sha256").update(`${items}#${addr}#${input.currency.toUpperCase()}`).digest("hex")
}

interface Backend {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlS: number): Promise<void>
}

const memory = new Map<string, { v: string; exp: number }>()
const memoryBackend: Backend = {
  async get(k) {
    const e = memory.get(k)
    if (!e) return null
    if (e.exp < Date.now()) {
      memory.delete(k)
      return null
    }
    return e.v
  },
  async set(k, v, ttl) {
    memory.set(k, { v, exp: Date.now() + ttl * 1000 })
  },
}

let backend: Backend | null = null
function getBackend(): Backend {
  if (backend) return backend
  const url = process.env.REDIS_URL
  if (url && !process.env.TEST_TYPE) {
    const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 })
    backend = {
      get: (k) => client.get(k),
      set: async (k, v, ttl) => {
        await client.set(k, v, "EX", Math.max(1, ttl))
      },
    }
  } else {
    backend = memoryBackend
  }
  return backend
}

const key = (cartId: string) => `haanta:quote:${cartId}`

export async function saveQuote(q: StoredQuote, ttlS: number): Promise<void> {
  await getBackend().set(key(q.cart_id), JSON.stringify(q), Math.max(60, ttlS))
}

export async function loadQuote(cartId: string): Promise<StoredQuote | null> {
  const raw = await getBackend().get(key(cartId))
  return raw ? (JSON.parse(raw) as StoredQuote) : null
}
