/** Recently viewed products, kept in localStorage (no prices: prices always come from the backend). */
export const RECENT_KEY = "haanta_recently_viewed"
export const RECENT_MAX = 12

export interface RecentItem {
  handle: string
  title: string
  brand: string
  thumbnail: string | null
}

export function pushRecent(list: RecentItem[], item: RecentItem, max = RECENT_MAX): RecentItem[] {
  return [item, ...list.filter((x) => x.handle !== item.handle)].slice(0, max)
}

function isRecent(x: unknown): x is RecentItem {
  if (typeof x !== "object" || x === null) return false
  const r = x as Record<string, unknown>
  return typeof r.handle === "string" && typeof r.title === "string"
}

export function parseRecent(raw: string | null): RecentItem[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .filter(isRecent)
      .filter((x) => /^[a-z0-9][a-z0-9-]*$/i.test(x.handle))
      .map((x) => ({ handle: x.handle, title: x.title, brand: typeof x.brand === "string" ? x.brand : "", thumbnail: typeof x.thumbnail === "string" ? x.thumbnail : null }))
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}
