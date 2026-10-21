import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { ProductCard } from "@/components/product/ProductCard"
import { ProductImage } from "@/components/ui/ProductImage"
import { ShopTiles } from "@/components/home/ShopTiles"
import { getBanners, getHomepage, listJournalPosts, listShops } from "@/lib/content"
import { parseFilters } from "@/lib/filters"
import { searchProducts, shopCoverImages } from "@/lib/server/catalog"
import { getRegion } from "@/lib/server/region"
import { getWishlistIds } from "@/lib/server/customer"
import { CATEGORIES } from "@/lib/categories"
import { TAGLINE } from "@/lib/site"
import type { SearchDocument } from "@/lib/types"

export const metadata: Metadata = {
  title: { absolute: "Haanta | Curated African fashion: Style. Story. Soul." },
  description: `${TAGLINE}. Shop curated African designers with duties and taxes included for the US and Canada.`,
  alternates: { canonical: "/" },
  openGraph: { title: "Haanta | Curated African fashion", description: TAGLINE, url: "/" },
}

const EDITORIAL = {
  hero: "/images/editorial/hero-menswear-brown.webp",
  pink: "/images/editorial/editorial-womenswear-pink.webp",
  adire: "/images/editorial/editorial-adire-portrait.webp",
}

/** The three departments shown as the home triptych (the rest are one click away in the menu). */
const DEPARTMENTS = ["women", "men", "accessories"] as const

const firstImage = (d: SearchDocument | undefined) => d?.images?.[0] ?? d?.thumbnail ?? null

const PROMISES = [
  { title: "Duties included", body: "Every US and Canada price includes duties and taxes. No surprises at the door." },
  { title: "Vetted designers", body: "Every studio visited, every piece checked before it ships." },
  { title: "Made to measure", body: "Many pieces are cut to your measurements at no extra cost." },
  { title: "Free US shipping", body: "On orders over $150, with tracking from the studio to you." },
]

export default async function HomePage() {
  await connection()
  const { currency } = await getRegion()
  const base = parseFilters({})
  const departments = DEPARTMENTS.map((h) => CATEGORIES.find((c) => c.handle === h)).filter((c) => c !== undefined)
  const [home, shops, posts, banners, best, fresh, saved, facets] = await Promise.all([
    getHomepage(),
    listShops(),
    listJournalPosts(),
    getBanners(),
    searchProducts({ ...base, sort: "best_selling" }, { currency, limit: 8 }),
    searchProducts({ ...base, sort: "newest" }, { currency, limit: 8 }),
    getWishlistIds(),
    searchProducts({ ...base }, { currency, limit: 1 }),
  ])
  const topBrand = facets.facets.brand?.[0]
  const [deptHits, shopImages, spotlight] = await Promise.all([
    Promise.all(departments.map((c) => searchProducts({ ...base, category: c.handle, sort: "best_selling" }, { currency, limit: 2 }))),
    shopCoverImages(shops.map((s) => s.slug), currency),
    topBrand ? searchProducts({ ...base, brand: [topBrand.value], sort: "best_selling" }, { currency, limit: 5 }) : null,
  ])
  const promo = banners.find((b) => b.placement === "home")
  const spot = spotlight && spotlight.hits.length >= 3 ? spotlight : null
  const spotVendor = spot?.hits[0]?.vendor

  return (
    <main id="main" className="s-home">
      <section className="s-hero" aria-labelledby="hero-title">
        <div className="s-hero__media">
          <ProductImage src={EDITORIAL.hero} alt="" priority sizes="100vw" />
        </div>
        <div className="h-container s-hero__inner">
          <p className="s-hero__eyebrow">{home.hero.eyebrow}</p>
          <h1 id="hero-title" className="s-hero__title h-display">
            {home.hero.headline}
          </h1>
          <p className="s-hero__sub">{home.hero.subheadline}</p>
          <div className="s-hero__ctas">
            <Link href={home.hero.ctaHref} className="h-btn s-btn-light">
              {home.hero.ctaLabel}
            </Link>
            {home.hero.secondaryCtaHref ? (
              <Link href={home.hero.secondaryCtaHref} className="s-textlink s-textlink--light">
                {home.hero.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {promo ? (
        <div className="s-promo-strip">
          <div className="h-container">{promo.href ? <Link href={promo.href}>{promo.message}</Link> : <p>{promo.message}</p>}</div>
        </div>
      ) : null}

      <section className="h-container s-intro" aria-label="About Haanta">
        <p className="s-section__eyebrow">Haanta</p>
        <p className="s-intro__statement">
          Curated African fashion, from the studios of Lagos to Accra. Each piece chosen for its craft,
          each maker named, every price shown with duties paid.
        </p>
      </section>

      <section className="h-container s-depts" aria-label="Shop by department">
        <ul className="s-depts__list">
          {departments.map((c, i) => (
            <li key={c.handle}>
              <Link href={`/shop/${c.handle}`} className="s-dept">
                <span className="s-dept__media">
                  <ProductImage src={firstImage(deptHits[i]?.hits[0])} alt="" sizes="(min-width: 760px) 32vw, 100vw" />
                </span>
                <span className="s-dept__name">{c.name}</span>
                <span className="s-dept__cta" aria-hidden="true">
                  Shop now
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {fresh.hits.length ? (
        <section className="h-container s-section" aria-labelledby="new-title">
          <header className="s-head">
            <p className="s-section__eyebrow">Just landed</p>
            <h2 id="new-title" className="s-head__title h-display">
              New arrivals
            </h2>
          </header>
          <ul className="s-rail" aria-label="New arrivals">
            {fresh.hits.map((d) => (
              <li key={d.id} className="s-rail__item">
                <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
              </li>
            ))}
          </ul>
          <p className="s-head__more">
            <Link href="/shop?sort=newest" className="s-textlink">
              View all new arrivals
            </Link>
          </p>
        </section>
      ) : null}

      <section className="s-story" aria-labelledby="story-title">
        <div className="s-story__media">
          <ProductImage src={EDITORIAL.adire} alt="Close-up of a hand-dyed adire dress" sizes="(min-width: 900px) 50vw, 100vw" />
        </div>
        <div className="s-story__copy">
          <p className="s-section__eyebrow">Style. Story. Soul.</p>
          <h2 id="story-title" className="h-display">
            Every piece has a maker
          </h2>
          <p>
            We travel to the studios of Lagos and beyond, verify every piece, and tell the story of the people who make it,
            from indigo adire to hand-loomed aso-oke.
          </p>
          <Link href="/brands" className="s-textlink">
            Meet the designers
          </Link>
        </div>
      </section>

      <section className="h-container s-section" aria-labelledby="edits-title">
        <header className="s-head">
          <p className="s-section__eyebrow">Curated by Haanta</p>
          <h2 id="edits-title" className="s-head__title h-display">
            The Edits
          </h2>
        </header>
        <ShopTiles shops={shops} images={shopImages} />
      </section>

      <section className="s-banner" aria-labelledby="occasion-title">
        <div className="s-banner__media">
          <ProductImage src={EDITORIAL.pink} alt="Two women in tailored mini dresses" sizes="100vw" />
        </div>
        <div className="h-container s-banner__copy">
          <p className="s-section__eyebrow">The occasion edit</p>
          <h2 id="occasion-title" className="h-display">
            Dressed for the moment
          </h2>
          <p>Weddings, owambe and gala nights. Statement pieces, many made to measure.</p>
          <Link href="/shops/special-occasions" className="h-btn s-btn-light">
            Shop special occasions
          </Link>
        </div>
      </section>

      {spot && spotVendor ? (
        <section className="h-container s-section s-spot" aria-labelledby="spot-title">
          <div className="s-spot__intro">
            <p className="s-section__eyebrow">Designer in focus{spotVendor.region ? ` · ${spotVendor.region}` : ""}</p>
            <h2 id="spot-title" className="h-display">
              {spotVendor.name}
            </h2>
            <Link href={`/brands/${spotVendor.slug}`} className="s-textlink">
              Discover the studio
            </Link>
          </div>
          <ul className="s-spot__grid" aria-label={`${spotVendor.name} pieces`}>
            {spot.hits.slice(0, 4).map((d) => (
              <li key={d.id}>
                <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {best.hits.length ? (
        <section className="h-container s-section" aria-labelledby="best-title">
          <header className="s-head">
            <p className="s-section__eyebrow">Loved by our community</p>
            <h2 id="best-title" className="s-head__title h-display">
              Most loved
            </h2>
          </header>
          <ul className="s-rail" aria-label="Most loved">
            {best.hits.map((d) => (
              <li key={d.id} className="s-rail__item">
                <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
              </li>
            ))}
          </ul>
          <p className="s-head__more">
            <Link href="/shop?sort=best_selling" className="s-textlink">
              Shop best sellers
            </Link>
          </p>
        </section>
      ) : null}

      {posts.length ? (
        <section className="h-container s-section" aria-labelledby="journal-title">
          <header className="s-head">
            <p className="s-section__eyebrow">The Journal</p>
            <h2 id="journal-title" className="s-head__title h-display">
              Stories from the studios
            </h2>
          </header>
          <ul className="s-journal-list">
            {posts.slice(0, 3).map((p, i) => (
              <li key={p.slug} className="s-journal-card">
                <span className="s-journal-card__media">
                  <ProductImage src={p.coverImage ?? [EDITORIAL.adire, EDITORIAL.pink, EDITORIAL.hero][i % 3]!} alt="" sizes="(min-width: 800px) 32vw, 100vw" />
                </span>
                <p className="s-journal-card__date">
                  <time dateTime={p.publishedAt}>
                    {new Date(p.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
                  </time>
                </p>
                <h3>
                  <Link href={`/journal/${p.slug}`}>{p.title}</Link>
                </h3>
                <p>{p.excerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="h-container s-promises" aria-label="Why shop with Haanta">
        <ul>
          {PROMISES.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
