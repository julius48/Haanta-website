import "server-only"
import { z } from "zod"
import homepageFixture from "@/content/homepage.json"
import shopsFixture from "@/content/shops.json"
import journalFixture from "@/content/journal.json"
import bannersFixture from "@/content/banners.json"

/**
 * Editorial content behind one interface. With SANITY_PROJECT_ID set, content comes from Sanity's
 * HTTP GROQ API (no SDK); otherwise from the local fixtures in content/*.json. Every response is
 * validated with zod and falls back to the fixtures on error, so the shop never breaks on CMS issues.
 * Schema documentation: sanity/schemas.ts.
 */

const heroSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  subheadline: z.string(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
  secondaryCtaLabel: z.string().optional(),
  secondaryCtaHref: z.string().optional(),
})

const spotlightSchema = z.object({ brandSlug: z.string(), name: z.string(), tagline: z.string(), story: z.string(), region: z.string().nullable().optional() })

const homepageSchema = z.object({
  hero: heroSchema,
  pillars: z.array(z.object({ title: z.string(), body: z.string() })),
  brandSpotlights: z.array(spotlightSchema),
})

const shopSchema = z.object({ slug: z.string(), title: z.string(), tagline: z.string(), description: z.string(), image: z.string().nullable().optional() })

const postSchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  publishedAt: z.string(),
  author: z.string(),
  coverImage: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  body: z.array(z.string()),
})

const bannerSchema = z.object({ id: z.string(), placement: z.enum(["announcement", "home"]), message: z.string(), href: z.string().nullable().optional() })

export type Homepage = z.infer<typeof homepageSchema>
export type Shop = z.infer<typeof shopSchema>
export type JournalPost = z.infer<typeof postSchema>
export type Banner = z.infer<typeof bannerSchema>
export type BrandSpotlight = z.infer<typeof spotlightSchema>

export interface ContentSource {
  getHomepage(): Promise<Homepage>
  getShop(slug: string): Promise<Shop | null>
  listShops(): Promise<Shop[]>
  listJournalPosts(): Promise<JournalPost[]>
  getJournalPost(slug: string): Promise<JournalPost | null>
  getBanners(): Promise<Banner[]>
}

// ---------------------------------------------------------------- fixtures

const fixtures = {
  homepage: homepageSchema.parse(homepageFixture),
  shops: z.array(shopSchema).parse(shopsFixture),
  posts: z.array(postSchema).parse(journalFixture),
  banners: z.array(bannerSchema).parse(bannersFixture),
}

const sortPosts = (posts: JournalPost[]) => [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

export const fixtureSource: ContentSource = {
  async getHomepage() {
    return fixtures.homepage
  },
  async getShop(slug) {
    return fixtures.shops.find((s) => s.slug === slug) ?? null
  },
  async listShops() {
    return fixtures.shops
  },
  async listJournalPosts() {
    return sortPosts(fixtures.posts)
  },
  async getJournalPost(slug) {
    return fixtures.posts.find((p) => p.slug === slug) ?? null
  },
  async getBanners() {
    return fixtures.banners
  },
}

// ---------------------------------------------------------------- Sanity (HTTP GROQ API)

const API_VERSION = "v2024-01-01"

async function groq<T>(query: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
  const projectId = process.env.SANITY_PROJECT_ID!
  const dataset = process.env.SANITY_DATASET || "production"
  const token = process.env.SANITY_API_TOKEN
  if (!/^[a-z0-9-]+$/i.test(projectId) || !/^[a-z0-9_-]+$/i.test(dataset)) throw new Error("Invalid Sanity configuration")
  const host = token ? "api.sanity.io" : "apicdn.sanity.io"
  const url = new URL(`https://${projectId}.${host}/${API_VERSION}/data/query/${dataset}`)
  url.searchParams.set("query", query)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(`$${k}`, JSON.stringify(v))
  const res = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    next: { revalidate: 300, tags: ["content"] },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Sanity query failed (${res.status})`)
  const body = (await res.json()) as { result: unknown }
  return schema.parse(body.result)
}

const SHOP_FIELDS = `"slug": slug.current, title, tagline, description, "image": image.asset->url`
const POST_FIELDS = `"slug": slug.current, title, excerpt, publishedAt, "author": coalesce(author, "Haanta Editorial"), "coverImage": coverImage.asset->url, "tags": coalesce(tags, []), "body": body[_type == "block"]{"t": pt::text(@)}.t`

export const sanitySource: ContentSource = {
  getHomepage: () =>
    groq(
      `*[_type == "homepage"][0]{ hero, "pillars": coalesce(pillars, []), "brandSpotlights": coalesce(brandSpotlights[]->{ "brandSlug": brandSlug, name, tagline, story, region }, []) }`,
      {},
      homepageSchema,
    ),
  getShop: (slug) => groq(`*[_type == "shop" && slug.current == $slug][0]{ ${SHOP_FIELDS} }`, { slug }, shopSchema.nullable()),
  listShops: () => groq(`*[_type == "shop"] | order(orderRank asc){ ${SHOP_FIELDS} }`, {}, z.array(shopSchema)),
  listJournalPosts: () => groq(`*[_type == "journalPost"] | order(publishedAt desc){ ${POST_FIELDS} }`, {}, z.array(postSchema)),
  getJournalPost: (slug) => groq(`*[_type == "journalPost" && slug.current == $slug][0]{ ${POST_FIELDS} }`, { slug }, postSchema.nullable()),
  getBanners: () => groq(`*[_type == "banner" && active == true]{ "id": _id, placement, message, href }`, {}, z.array(bannerSchema)),
}

function source(): ContentSource {
  return process.env.SANITY_PROJECT_ID ? sanitySource : fixtureSource
}

async function withFallback<T>(fn: (s: ContentSource) => Promise<T>): Promise<T> {
  const s = source()
  if (s === fixtureSource) return fn(fixtureSource)
  try {
    return await fn(s)
  } catch (err) {
    console.warn("[content] Sanity unavailable, using fixtures:", err instanceof Error ? err.message : err)
    return fn(fixtureSource)
  }
}

export const getHomepage = () => withFallback((s) => s.getHomepage())
export const getShop = (slug: string) => withFallback((s) => s.getShop(slug))
export const listShops = () => withFallback((s) => s.listShops())
export const listJournalPosts = () => withFallback((s) => s.listJournalPosts())
export const getJournalPost = (slug: string) => withFallback((s) => s.getJournalPost(slug))
export const getBanners = () => withFallback((s) => s.getBanners())
