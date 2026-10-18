import type { MetadataRoute } from "next"
import { allCategoryHandles } from "@/lib/categories"
import { listJournalPosts, listShops } from "@/lib/content"
import { parseFilters } from "@/lib/filters"
import { listBrands, searchProducts } from "@/lib/server/catalog"
import { absoluteUrl } from "@/lib/site"

export const revalidate = 3600

const STATIC = ["/", "/shop", "/shops", "/brands", "/journal", "/about", "/faq", "/track", "/help/shipping", "/help/returns"]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: absoluteUrl(p), lastModified: now, changeFrequency: "daily", priority: p === "/" ? 1 : 0.7 }))
  for (const c of allCategoryHandles()) entries.push({ url: absoluteUrl(`/shop/${c}`), changeFrequency: "daily", priority: 0.7 })
  const [shops, posts, brands] = await Promise.all([listShops(), listJournalPosts(), listBrands()])
  for (const s of shops) entries.push({ url: absoluteUrl(`/shops/${s.slug}`), changeFrequency: "weekly", priority: 0.6 })
  for (const p of posts) entries.push({ url: absoluteUrl(`/journal/${p.slug}`), lastModified: new Date(p.publishedAt), changeFrequency: "monthly", priority: 0.4 })
  for (const b of brands) entries.push({ url: absoluteUrl(`/brands/${b.slug}`), changeFrequency: "weekly", priority: 0.6 })

  // Products: page through the search API (in-stock only), capped to keep the sitemap fast.
  const base = { ...parseFilters({}), sort: "newest" as const }
  for (let page = 1; page <= 50; page++) {
    const res = await searchProducts({ ...base, page }, { currency: "usd", limit: 60 })
    for (const d of res.hits) entries.push({ url: absoluteUrl(`/products/${d.handle}`), lastModified: new Date(d.created_at), changeFrequency: "weekly", priority: 0.8 })
    if (res.error || page >= res.pages) break
  }
  return entries
}
