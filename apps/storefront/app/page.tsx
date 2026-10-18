import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { connection } from "next/server"
import { ProductCard, ProductGrid } from "@/components/product/ProductCard"
import { ProductImage } from "@/components/ui/ProductImage"
import { getBanners, getHomepage, listJournalPosts, listShops } from "@/lib/content"
import { parseFilters } from "@/lib/filters"
import { searchProducts } from "@/lib/server/catalog"
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

const firstImage = (d: SearchDocument | undefined) => d?.images?.[0] ?? d?.thumbnail ?? null

function PromiseIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

export default async function HomePage() {
  await connection()
  const { currency } = await getRegion()
  const base = parseFilters({})
  const homeCategories = CATEGORIES.filter((c) =>
    ["women", "men", "accessories", "beauty", "home"].includes(c.handle),
  )
  const [home, shops, posts, banners, best, fresh, saved] = await Promise.all([
    getHomepage(),
    listShops(),
    listJournalPosts(),
    getBanners(),
    searchProducts({ ...base, sort: "best_selling" }, { currency, limit: 8 }),
    searchProducts({ ...base, sort: "newest" }, { currency, limit: 10 }),
    getWishlistIds(),
  ])
  // One representative product image per category and per curated shop (cached search calls).
  const [catHits, shopHits] = await Promise.all([
    Promise.all(
      homeCategories.map((c) =>
        searchProducts(
          { ...base, category: c.handle, sort: "best_selling" },
          { currency, limit: 1 },
        ),
      ),
    ),
    Promise.all(
      shops.map((s) =>
        searchProducts({ ...base, sort: "best_selling" }, { currency, shop: s.slug, limit: 1 }),
      ),
    ),
  ])
  const promo = banners.find((b) => b.placement === "home")
  // Designer rows (Onuli-style): the three designers with the most in-stock pieces.
  const topBrands = (await searchProducts({ ...base }, { currency, limit: 1 })).facets.brand?.slice(0, 3) ?? []
  const designerRows = (
    await Promise.all(topBrands.map((b) => searchProducts({ ...base, brand: [b.value], sort: "best_selling" }, { currency, limit: 6 })))
  ).filter((r) => r.hits.length >= 3)

  return (
    <main id="main">
      <section className="s-hero" aria-labelledby="hero-title">
        <div className="s-hero__media">
          <Image src={EDITORIAL.hero} alt="" fill priority sizes="100vw" />
        </div>
        <div className="h-container s-hero__inner">
          <p className="s-hero__eyebrow">{home.hero.eyebrow}</p>
          <h1 id="hero-title" className="s-hero__title h-display">
            {home.hero.headline}
          </h1>
          <p className="s-hero__sub">{home.hero.subheadline}</p>
          <div className="s-hero__ctas">
            <Link href={home.hero.ctaHref} className="h-btn s-btn-tan">
              {home.hero.ctaLabel}
            </Link>
            {home.hero.secondaryCtaHref ? (
              <Link href={home.hero.secondaryCtaHref} className="h-btn s-btn-outline-light">
                {home.hero.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="s-promises" aria-label="Why shop with Haanta">
        <ul className="h-container">
          <li>
            <PromiseIcon d="M3 7h12v9H3zM15 10h4l2 3v3h-6M7 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
            <span>Duties and taxes included in every US and Canada price</span>
          </li>
          <li>
            <PromiseIcon d="M12 3l2.5 5.2 5.5.8-4 3.9.9 5.6L12 15.9 7.1 18.5l.9-5.6-4-3.9 5.5-.8z" />
            <span>Every designer vetted and every piece checked</span>
          </li>
          <li>
            <PromiseIcon d="M4 20l3-3m0 0l7-7 3 3-7 7H7v-3zM14 7l3 3M16 5l3 3" />
            <span>Made-to-measure pieces cut to your size</span>
          </li>
          <li>
            <PromiseIcon d="M3 12h4l2-6 4 12 2-6h6" />
            <span>Free US shipping on orders over $150</span>
          </li>
        </ul>
      </section>

      {promo ? (
        <div className="s-promo-strip">
          <div className="h-container">
            {promo.href ? <Link href={promo.href}>{promo.message}</Link> : <p>{promo.message}</p>}
          </div>
        </div>
      ) : null}

      <section className="h-container s-section" aria-labelledby="cats-title">
        <div className="s-section__head">
          <div>
            <span className="s-section__eyebrow">Shop by category</span>
            <h2 id="cats-title">Find your piece</h2>
          </div>
          <Link href="/shop">Shop all</Link>
        </div>
        <ul className="s-cats">
          {homeCategories.map((c, i) => (
            <li key={c.handle}>
              <Link href={`/shop/${c.handle}`} className="s-cat">
                <span className="s-cat__media">
                  <ProductImage
                    src={firstImage(catHits[i]?.hits[0])}
                    alt=""
                    sizes="(min-width: 900px) 18vw, 45vw"
                  />
                </span>
                <span className="s-cat__name">
                  <span>{c.name}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {fresh.hits.length ? (
        <section className="h-container s-section" aria-labelledby="new-title">
          <div className="s-section__head">
            <div>
              <span className="s-section__eyebrow">Just landed</span>
              <h2 id="new-title">New arrivals</h2>
            </div>
            <Link href="/shop?sort=newest">Shop new in</Link>
          </div>
          <ul className="s-rail" aria-label="New arrivals">
            {fresh.hits.map((d) => (
              <li key={d.id} className="s-rail__item">
                <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="h-container s-section" aria-labelledby="shops-title">
        <div className="s-section__head">
          <div>
            <span className="s-section__eyebrow">Curated by Haanta stylists</span>
            <h2 id="shops-title">Shop the edit</h2>
          </div>
          <Link href="/shops">All shops</Link>
        </div>
        <ul className="s-shop-tiles">
          {shops.map((s, i) => (
            <li key={s.slug}>
              <Link href={`/shops/${s.slug}`} className="s-shop-tile" data-testid="shop-tile">
                <span className="s-shop-tile__media">
                  <ProductImage
                    src={firstImage(shopHits[i]?.hits[0])}
                    alt=""
                    sizes="(min-width: 1100px) 32vw, (min-width: 700px) 48vw, 100vw"
                  />
                </span>
                <h3 className="s-shop-tile__title h-display">{s.title}</h3>
                <span className="s-shop-tile__tag">{s.tagline}</span>
                <span className="s-shop-tile__cta" aria-hidden="true">
                  Explore the edit →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="s-editorial" aria-labelledby="story-title">
        <div className="s-editorial__media">
          <Image
            src={EDITORIAL.adire}
            alt="Close-up of a hand-dyed adire dress"
            fill
            sizes="(min-width: 900px) 50vw, 100vw"
          />
        </div>
        <div className="s-editorial__copy">
          <span className="s-section__eyebrow">Style. Story. Soul.</span>
          <h2 id="story-title" className="h-display">
            Every piece has a maker
          </h2>
          <p>
            Haanta is where Africa meets the world. We travel to the studios of Lagos and beyond,
            verify every piece, and tell the story of the people who make it, from indigo adire to
            hand-loomed aso-oke.
          </p>
          <Link href="/brands" className="h-btn h-btn--primary">
            Meet the designers
          </Link>
        </div>
      </section>

      <section className="h-container s-section" aria-labelledby="best-title">
        <div className="s-section__head">
          <div>
            <span className="s-section__eyebrow">Loved by our community</span>
            <h2 id="best-title">Best sellers</h2>
          </div>
          <Link href="/shop?sort=best_selling">Shop best sellers</Link>
        </div>
        {best.hits.length ? (
          <ProductGrid docs={best.hits} currency={currency} savedIds={saved} label="Best sellers" />
        ) : (
          <p className="s-muted">New pieces are on their way. Check back soon.</p>
        )}
      </section>

      <section
        className="s-editorial s-editorial--dark s-editorial--reverse"
        aria-labelledby="occasion-title"
      >
        <div className="s-editorial__media">
          <Image
            src={EDITORIAL.pink}
            alt="Two women in tailored mini dresses"
            fill
            sizes="(min-width: 900px) 50vw, 100vw"
          />
        </div>
        <div className="s-editorial__copy">
          <span className="s-section__eyebrow">The occasion edit</span>
          <h2 id="occasion-title" className="h-display">
            Dressed for the moment
          </h2>
          <p>
            Weddings, owambe, gala nights and everything in between. Statement pieces, many made to
            measure for you.
          </p>
          <Link href="/shops/special-occasions" className="h-btn s-btn-tan">
            Shop special occasions
          </Link>
        </div>
      </section>

      {designerRows.map((r) => {
        const v = r.hits[0]!.vendor
        return (
          <section key={v.slug} className="h-container s-designer-row" aria-labelledby={`designer-${v.slug}`}>
            <span className="s-section__eyebrow">{v.region ?? "Designer spotlight"}</span>
            <h2 id={`designer-${v.slug}`} className="s-designer-row__name">
              {v.name}
            </h2>
            <ul className="s-designer-row__grid" aria-label={`${v.name} pieces`}>
              {r.hits.map((d) => (
                <li key={d.id}>
                  <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
                </li>
              ))}
            </ul>
            <Link href={`/brands/${v.slug}`} className="h-btn h-btn--primary">
              View all
            </Link>
          </section>
        )
      })}

      <section className="h-container s-section" aria-labelledby="pillars-title">
        <div className="s-section__head">
          <div>
            <span className="s-section__eyebrow">Our promise</span>
            <h2 id="pillars-title">Why Haanta</h2>
          </div>
        </div>
        <ul className="s-pillars">
          {home.pillars.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {posts.length ? (
        <section className="h-container s-section" aria-labelledby="journal-title">
          <div className="s-section__head">
            <div>
              <span className="s-section__eyebrow">The Journal</span>
              <h2 id="journal-title">Stories from the studios</h2>
            </div>
            <Link href="/journal">Read the Journal</Link>
          </div>
          <ul className="s-journal-list">
            {posts.slice(0, 3).map((p, i) => (
              <li key={p.slug} className="s-journal-card">
                <span className="s-journal-card__media">
                  <Image
                    src={p.coverImage ?? [EDITORIAL.adire, EDITORIAL.pink, EDITORIAL.hero][i % 3]!}
                    alt=""
                    fill
                    sizes="(min-width: 800px) 32vw, 100vw"
                  />
                </span>
                <p className="s-small s-muted">
                  <time dateTime={p.publishedAt}>
                    {new Date(p.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
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
    </main>
  )
}
