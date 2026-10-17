/**
 * Fixed-window rate limiting and login lockout. Stores are pluggable: in-memory for dev/tests,
 * Redis in staging/production (see apps/backend).
 */

export interface CounterStore {
  /** Increment key, set TTL on first increment, return the new count and ms until reset. */
  incr(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>
  get(key: string): Promise<number>
  del(key: string): Promise<void>
}

export function createMemoryCounterStore(now: () => number = Date.now): CounterStore {
  const m = new Map<string, { count: number; expiresAt: number }>()
  const live = (key: string) => {
    const e = m.get(key)
    if (e && e.expiresAt <= now()) {
      m.delete(key)
      return undefined
    }
    return e
  }
  return {
    async incr(key, windowMs) {
      const e = live(key)
      if (!e) {
        m.set(key, { count: 1, expiresAt: now() + windowMs })
        return { count: 1, resetMs: windowMs }
      }
      e.count++
      return { count: e.count, resetMs: e.expiresAt - now() }
    },
    async get(key) {
      return live(key)?.count ?? 0
    },
    async del(key) {
      m.delete(key)
    },
  }
}

export interface RateLimitRule {
  /** Bucket name, e.g. "auth", "search", "shipping-quote". */
  name: string
  limit: number
  windowMs: number
}

/** Rate limits per route group (ASVS 2.2.1 / 11.1.4). Tuned for a small marketplace; all are settings. */
export const RATE_LIMITS = {
  auth: { name: "auth", limit: 10, windowMs: 60_000 },
  passwordReset: { name: "password-reset", limit: 5, windowMs: 15 * 60_000 },
  search: { name: "search", limit: 60, windowMs: 60_000 },
  shippingQuote: { name: "shipping-quote", limit: 20, windowMs: 60_000 },
  reviews: { name: "reviews", limit: 5, windowMs: 60 * 60_000 },
  checkout: { name: "checkout", limit: 10, windowMs: 60_000 },
  newsletter: { name: "newsletter", limit: 5, windowMs: 60 * 60_000 },
  webhook: { name: "webhook", limit: 300, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>

export async function hitRateLimit(
  store: CounterStore,
  rule: RateLimitRule,
  subject: string,
): Promise<{ allowed: boolean; remaining: number; retryAfterS: number }> {
  const { count, resetMs } = await store.incr(`rl:${rule.name}:${subject}`, rule.windowMs)
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterS: Math.ceil(resetMs / 1000),
  }
}

export interface LockoutPolicy {
  maxFailures: number
  windowMs: number
  lockMs: number
}

export const DEFAULT_LOCKOUT: LockoutPolicy = { maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 }

/**
 * Account lockout keyed by account identifier (not IP) to slow credential stuffing, plus a separate
 * per-IP rate limit at the route. Lockout is temporary to avoid permanent denial of service.
 */
export function createLockout(store: CounterStore, policy: LockoutPolicy = DEFAULT_LOCKOUT) {
  const failKey = (id: string) => `lock:fail:${id.toLowerCase()}`
  const lockKey = (id: string) => `lock:locked:${id.toLowerCase()}`
  return {
    async isLocked(id: string) {
      return (await store.get(lockKey(id))) > 0
    },
    async recordFailure(id: string): Promise<{ locked: boolean; failures: number }> {
      const { count } = await store.incr(failKey(id), policy.windowMs)
      if (count >= policy.maxFailures) {
        await store.incr(lockKey(id), policy.lockMs)
        await store.del(failKey(id))
        return { locked: true, failures: count }
      }
      return { locked: false, failures: count }
    },
    async recordSuccess(id: string) {
      await store.del(failKey(id))
    },
  }
}
