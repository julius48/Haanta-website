import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { ProductGrid } from "@/components/product/ProductCard"
import { Breadcrumbs } from "@/components/ui/Breadcrumbs"
import { JsonLd } from "@/components/ui/JsonLd"
import { ProductImage } from "@/components/ui/ProductImage"
import { breadcrumbJsonLd } from "@/lib/jsonld"
import { getBrand } from "@/lib/server/catalog"
import { getRegion } from "@/lib/server/region"
import { getWishlistIds } from "@/lib/server/customer"
import { safeImage } from "@/lib/images"

type Props = { params: Promise<{ slug: string }> }

const strip = (html: string | null) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { currency } = await getRegion()
  const data = await getBrand(slug, currency).catch(() => null)
  if (!data) return { title: "Designer not found", robots: { index: false } }
  const b = data.brand
  const description = (strip(b.story) || `Shop ${b.name}${b.region ? ` from ${b.region}` : ""} on Haanta.`).slice(0, 160)
  const image = safeImage(b.banner_url ?? b.logo_url)
  return {
    title: `${b.name}: designer`,
    description,
    alternates: { canonical: `/brands/${b.slug}` },
    openGraph: { title: `${b.name} | Haanta`, description, url: `/brands/${b.slug}`, images: image ? [image] : undefined },
  }
}

export default async function BrandPage({ params }: Props) {
  await connection()
  const { slug } = await params
  const { currency } = await getRegion()
  const [data, saved] = await Promise.all([getBrand(slug, currency).catch(() => null), getWishlistIds()])
  if (!data) notFound()
  const b = data.brand
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Designers", path: "/brands" },
    { name: b.name, path: `/brands/${b.slug}` },
  ]
  return (
    <main id="main" className="s-brand">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <div className={`s-brand__banner ${safeImage(b.banner_url) ? "" : "s-brand__banner--plain"}`}>
        {safeImage(b.banner_url) ? <ProductImage src={b.banner_url} alt="" sizes="100vw" priority /> : null}
      </div>
      <div className="h-container">
        <Breadcrumbs items={crumbs} />
        <div className="s-brand__head">
          {safeImage(b.logo_url) ? (
            <div className="s-brand__logo">
              <ProductImage src={b.logo_url} alt={`${b.name} logo`} sizes="96px" />
            </div>
          ) : null}
          <div>
            <h1>{b.name}</h1>
            {b.region ? <p className="s-muted">{b.region}</p> : null}
          </div>
        </div>
        <div className="s-brand__grid">
          <div>
            {b.story ? (
              <section aria-labelledby="story-title">
                <h2 id="story-title">The story</h2>
                {/* Story HTML is sanitised by the backend (allow-list) before it is stored. */}
                <div className="s-prose" dangerouslySetInnerHTML={{ __html: b.story }} />
              </section>
            ) : null}
          </div>
          <aside className="s-brand__aside">
            {b.size_notes ? (
              <section aria-labelledby="size-title">
                <h2 id="size-title">Sizing</h2>
                <p>{b.size_notes}</p>
              </section>
            ) : null}
            {b.policies ? (
              <section aria-labelledby="pol-title">
                <h2 id="pol-title">Policies</h2>
                <p className="s-prewrap">{b.policies}</p>
              </section>
            ) : null}
          </aside>
        </div>
        <section className="s-section" aria-labelledby="brand-products">
          <h2 id="brand-products">
            Shop {b.name} <span className="s-muted s-small">({data.total})</span>
          </h2>
          {data.products.length ? <ProductGrid docs={data.products} currency={currency} savedIds={saved} label={`${b.name} products`} /> : <p>New pieces coming soon.</p>}
        </section>
      </div>
    </main>
  )
}
