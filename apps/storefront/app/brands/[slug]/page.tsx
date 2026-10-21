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

/** First sentence or two of the story, for the introduction beside the cover photo. */
function excerpt(text: string, max = 220): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`
}

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
  const lead = data.products[0]
  const cover = safeImage(b.banner_url) ? b.banner_url : (lead?.images?.[0] ?? lead?.thumbnail ?? null)
  const story = strip(b.story)
  return (
    <main id="main" className="s-brand">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <div className="h-container">
        <Breadcrumbs items={crumbs} />
      </div>
      <header className="s-brand__intro">
        <div className="s-brand__copy">
          {safeImage(b.logo_url) ? (
            <div className="s-brand__logo">
              <ProductImage src={b.logo_url} alt={`${b.name} logo`} sizes="96px" />
            </div>
          ) : null}
          <p className="s-section__eyebrow">{b.region ? `Designer · ${b.region}` : "Designer"}</p>
          <h1 className="s-brand__name h-display">{b.name}</h1>
          {story ? <p className="s-brand__lead">{excerpt(story)}</p> : null}
          <a href="#brand-products" className="s-textlink">
            Shop the collection ({data.total})
          </a>
        </div>
        <div className="s-brand__cover">
          <ProductImage src={cover} alt="" sizes="(min-width: 900px) 50vw, 100vw" priority />
        </div>
      </header>
      <div className="h-container">
        {b.story || b.size_notes || b.policies ? (
          <div className="s-brand__grid">
            <div>
              {b.story ? (
                <section aria-labelledby="story-title">
                  <h2 id="story-title" className="s-brand__h2">
                    The story
                  </h2>
                  {/* Story HTML is sanitised by the backend (allow-list) before it is stored. */}
                  <div className="s-prose" dangerouslySetInnerHTML={{ __html: b.story }} />
                </section>
              ) : null}
            </div>
            <aside className="s-brand__aside">
              {b.size_notes ? (
                <section aria-labelledby="size-title">
                  <h2 id="size-title" className="s-brand__h2">
                    Sizing
                  </h2>
                  <p>{b.size_notes}</p>
                </section>
              ) : null}
              {b.policies ? (
                <section aria-labelledby="pol-title">
                  <h2 id="pol-title" className="s-brand__h2">
                    Policies
                  </h2>
                  <p className="s-prewrap">{b.policies}</p>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}
        <section id="brand-products" className="s-section" aria-labelledby="brand-products-title">
          <header className="s-head">
            <p className="s-section__eyebrow">{data.total} pieces</p>
            <h2 id="brand-products-title" className="s-head__title h-display">
              The collection
            </h2>
          </header>
          {data.products.length ? <ProductGrid docs={data.products} currency={currency} savedIds={saved} label={`${b.name} products`} /> : <p className="s-head__lead">New pieces coming soon.</p>}
        </section>
      </div>
    </main>
  )
}
