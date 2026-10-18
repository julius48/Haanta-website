import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Listing } from "@/components/listing/Listing"
import { Breadcrumbs } from "@/components/ui/Breadcrumbs"
import { JsonLd } from "@/components/ui/JsonLd"
import { breadcrumbJsonLd } from "@/lib/jsonld"
import { getShop } from "@/lib/content"
import { hasActiveFilters, parseFilters, type RawParams } from "@/lib/filters"
import { listingCanonical, loadListing } from "@/lib/server/listing"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const shop = /^[a-z0-9-]{1,60}$/.test(slug) ? await getShop(slug) : null
  if (!shop) return { title: "Shop not found" }
  const f = parseFilters(await searchParams)
  return {
    title: `${shop.title}: curated African fashion`,
    description: `${shop.tagline}. ${shop.description}`.slice(0, 160),
    alternates: { canonical: listingCanonical(`/shops/${shop.slug}`, f.page) },
    openGraph: { title: `${shop.title} | Haanta`, description: shop.tagline, url: `/shops/${shop.slug}`, images: shop.image ? [shop.image] : undefined },
    robots: hasActiveFilters(f) ? { index: false, follow: true } : undefined,
  }
}

export default async function CuratedShopPage({ params, searchParams }: Props) {
  await connection()
  const { slug } = await params
  const shop = /^[a-z0-9-]{1,60}$/.test(slug) ? await getShop(slug) : null
  if (!shop) notFound()
  const data = await loadListing(await searchParams, { shop: shop.slug })
  const items = [
    { name: "Home", path: "/" },
    { name: "Curated shops", path: "/shops" },
    { name: shop.title, path: `/shops/${shop.slug}` },
  ]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(items)} />
      <Listing
        title={shop.title}
        hero={
          <section className="s-shop-hero" aria-labelledby="shop-hero-tag">
            <div className="h-container">
              <p id="shop-hero-tag" className="s-shop-hero__eyebrow">
                Curated shop
              </p>
              <p className="s-shop-hero__tagline h-display">{shop.tagline}</p>
            </div>
          </section>
        }
        intro={<p>{shop.description}</p>}
        breadcrumbs={<Breadcrumbs items={items} />}
        ctx={{ basePath: `/shops/${shop.slug}`, categoryMode: "param" }}
        {...data}
      />
    </>
  )
}
