import Redis from "ioredis"
import { createMemoryCounterStore, type CounterStore } from "@haanta/core"

/** Rate-limit and lockout counters: Redis in staging/production (shared across instances), memory locally. */
let store: CounterStore | null = null

export function getCounterStore(): CounterStore {
  if (store) return store
  const url = process.env.REDIS_URL
  if (!url || process.env.TEST_TYPE) {
    store = createMemoryCounterStore()
    return store
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 2 })
  store = {
    async incr(key, windowMs) {
      const results = await redis.multi().incr(key).pexpire(key, windowMs, "NX").pttl(key).exec()
      const count = Number(results?.[0]?.[1] ?? 1)
      const ttl = Number(results?.[2]?.[1] ?? windowMs)
      return { count, resetMs: ttl > 0 ? ttl : windowMs }
    },
    async get(key) {
      return Number((await redis.get(key)) ?? 0)
    },
    async del(key) {
      await redis.del(key)
    },
  }
  return store
}

/** Tests reset counters between cases. */
export function resetCounterStoreForTest() {
  store = createMemoryCounterStore()
}
