import "server-only"
import { CATEGORIES, categoryHandle } from "../categories"
import { BACKEND_URL } from "./api"

/**
 * Resolve category paths (lib/categories.ts) to Medusa category ids and back, via the public store
 * API with the publishable key. Cached in memory for 10 minutes (categories rarely change).
 */
interface CategoryMap {
  idByPath: Map<string, string>
  pathById: Map<string, string>
  loadedAt: number
}

let cached: CategoryMap | null = null
const TTL_MS = 10 * 60_000

async function loadMap(): Promise<CategoryMap> {
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached
  const key = process.env.MEDUSA_PUBLISHABLE_KEY
  if (!key) throw new Error("MEDUSA_PUBLISHABLE_KEY is not set")
  const qs = new URLSearchParams({ fields: "id,handle", limit: "100" })
  for (const c of CATEGORIES) qs.append("handle[]", c.handle)
  const res = await fetch(`${BACKEND_URL}/store/product-categories?${qs}`, { headers: { "x-publishable-api-key": key }, cache: "no-store" })
  if (!res.ok) throw new Error(`Category lookup failed (${res.status})`)
  const body = (await res.json()) as { product_categories?: { id: string; handle: string }[] }
  const byHandle = new Map((body.product_categories ?? []).map((c) => [c.handle, c.id]))
  const idByPath = new Map<string, string>()
  const pathById = new Map<string, string>()
  for (const c of CATEGORIES) {
    const id = byHandle.get(categoryHandle(c.path)) ?? byHandle.get(c.path)
    if (id) {
      idByPath.set(c.path, id)
      pathById.set(id, c.path)
    }
  }
  cached = { idByPath, pathById, loadedAt: Date.now() }
  return cached
}

export async function categoryIdsForPaths(paths: string[]): Promise<string[]> {
  const wanted = paths.filter(Boolean)
  if (!wanted.length) return []
  const map = await loadMap()
  return wanted.map((p) => {
    const id = map.idByPath.get(p)
    if (!id) throw new Error(`Unknown category ${p}`)
    return id
  })
}

/** First category id that maps to a known path (the form edits one category). */
export async function pathForCategoryIds(ids: string[] | undefined): Promise<string> {
  if (!ids?.length) return ""
  try {
    const map = await loadMap()
    for (const id of ids) {
      const p = map.pathById.get(id)
      if (p) return p
    }
  } catch {
    // Fall through: the vendor can pick the category again.
  }
  return ""
}
