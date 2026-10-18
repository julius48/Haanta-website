import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Badge } from "@haanta/ui"
import { AddToCartForm } from "@/components/product/AddToCartForm"
import { Gallery } from "@/components/product/Gallery"
import { SizeChart } from "@/components/product/SizeChart"
import { ReviewForm } from "@/components/product/ReviewForm"
import { RecentlyViewed } from "@/components/product/RecentlyViewed"
import { ProductCard, shipsFromText } from "@/components/product/ProductCard"
import { WishlistButton } from "@/components/product/WishlistButton"
import { Breadcrumbs } from "@/components/ui/Breadcrumbs"
import { JsonLd } from "@/components/ui/JsonLd"
import { ProductImage } from "@/components/ui/ProductImage"
import { breadcrumbJsonLd, productJsonLd } from "@/lib/jsonld"
import { findCategory } from "@/lib/categories"
import { getProduct, getProductExtras, getSettings, isHandle, productPrice, slimForClient } from "@/lib/server/catalog"
import { getRegion } from "@/lib/server/region"
import { getWishlistIds, isSignedIn } from "@/lib/server/customer"
import { safeImage } from "@/lib/images"
import type { ProductExtras } from "@/lib/types"

type Props = { params: Promise<{ handle: string }> }

function plain(html: string | null): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

async function load(handle: string) {
  if (!isHandle(handle)) return null
  const { region } = await getRegion()
  const [product, extras] = await Promise.all([getProduct(handle, region?.id).catch(() => null), getProductExtras(handle).catch(() => null)])
  if (!product || !extras) return null
  return { product, extras }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const data = await load(handle)
  if (!data) return { title: "Product not found", robots: { index: false } }
  const { product, extras } = data
  const description = (plain(product.description) || `${product.title} by ${extras.vendor.name}`).slice(0, 160)
  const image = safeImage(product.thumbnail)
  return {
    title: `${product.title} by ${extras.vendor.name}`,
    description,
    alternates: { canonical: `/products/${product.handle}` },
    openGraph: { title: `${product.title} | Haanta`, description, url: `/products/${product.handle}`, images: image ? [{ url: image, alt: product.title }] : undefined },
  }
}

const FIT_LABEL: Record<string, string> = { runs_small: "Runs small", true_to_size: "True to size", runs_large: "Runs large" }

function FitSummary({ fit }: { fit: ProductExtras["reviews"]["fit"] }) {
  const total = fit.runs_small + fit.true_to_size + fit.runs_large
  if (!total) return null
  return (
    <dl className="s-fit-summary">
      {(Object.keys(FIT_LABEL) as (keyof typeof fit)[]).map((k) => (
        <div key={k}>
          <dt>{FIT_LABEL[k]}</dt>
          <dd>
            <meter min={0} max={total} value={fit[k]} aria-label={`${FIT_LABEL[k]}: ${fit[k]} of ${total} reviewers`} /> <span className="s-small">{Math.round((fit[k] / total) * 100)}%</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value)
  return (
    <span className="s-stars" aria-label={`${value} out of 5 stars`} role="img">
      <span aria-hidden="true">{"★".repeat(rounded)}{"☆".repeat(5 - rounded)}</span>
    </span>
  )
}

export default async function ProductPage({ params }: Props) {
  await connection()
  const { handle } = await params
  const data = await load(handle)
  if (!data) notFound()
  const { product, extras } = data
  const [{ currency }, settings, saved, signedIn] = await Promise.all([getRegion(), getSettings(), getWishlistIds(), isSignedIn()])
  const price = productPrice(product)
  const slim = slimForClient(product)
  const images = [...new Set([...(product.images ?? []).map((i) => i.url), ...(product.thumbnail ? [product.thumbnail] : [])])].filter((u): u is string => !!safeImage(u))
  const cat = (product.categories ?? []).map((c) => findCategory(c.handle.replace(/-/g, "/")) ?? findCategory(c.handle)).find(Boolean) ?? null
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    ...(cat?.parent ? [{ name: cat.parent.name, path: `/shop/${cat.parent.handle}` }] : []),
    ...(cat ? [{ name: cat.name, path: `/shop/${cat.handle}` }] : []),
    { name: product.title, path: `/products/${product.handle}` },
  ]
  const description = plain(product.description)
  const reviews = extras.reviews

  return (
    <main id="main" className="s-pdp">
      <JsonLd
        data={[
          productJsonLd({
            name: product.title,
            description: description || product.title,
            handle: product.handle,
            images,
            brand: extras.vendor.name,
            sku: product.variants?.[0]?.sku ?? null,
            price: price.amount,
            currency: price.currency || currency,
            inStock: slim.variants.some((v) => v.in_stock !== false),
            isPreorder: extras.is_preorder,
            rating: { average: reviews.average, count: reviews.count },
            returnWindowDays: settings.return_window_days,
          }),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <div className="h-container">
        <Breadcrumbs items={crumbs} />
        <div className="s-pdp__layout">
          <Gallery images={images} title={product.title} />
          <div className="s-pdp__info">
            <p className="s-brand-line">
              <Link href={`/brands/${extras.vendor.slug}`} data-testid="pdp-brand">
                {extras.vendor.name}
              </Link>
              {extras.vendor.region ? <span className="s-muted"> · {extras.vendor.region}</span> : null}
            </p>
            <h1 className="s-pdp__title" data-testid="pdp-title">
              {product.title}
            </h1>
            {extras.badges.length ? (
              <p className="s-badges" data-testid="pdp-badges">
                {extras.badges.map((b) => (
                  <Badge key={b} kind={b} />
                ))}
              </p>
            ) : null}
            {reviews.count > 0 && reviews.average != null ? (
              <p className="s-small">
                <a href="#reviews">
                  <Stars value={reviews.average} /> {reviews.count} review{reviews.count === 1 ? "" : "s"}
                </a>
              </p>
            ) : null}

            <AddToCartForm
              handle={product.handle}
              productId={product.id}
              title={product.title}
              brand={extras.vendor.name}
              options={slim.options}
              variants={slim.variants}
              variantFulfilment={Object.fromEntries(extras.variants.map((v) => [v.variant_id, v.fulfilment_type]))}
              defaultFulfilment={extras.fulfilment_type}
              requiredMeasurements={extras.required_measurements}
              isPreorder={extras.is_preorder}
            />

            <div className="s-pdp__size">
              <SizeChart chart={extras.size_chart} brand={extras.vendor.name} sizeNotes={extras.vendor.size_notes} fitNotes={extras.fit_notes} />
              {extras.fit_notes ? <p className="s-fit-note">Fit: {extras.fit_notes}</p> : null}
              {extras.vendor.size_notes ? <p className="s-fit-note">{extras.vendor.name} sizing: {extras.vendor.size_notes}</p> : null}
            </div>

            <WishlistButton productId={product.id} title={product.title} initialSaved={saved.includes(product.id)} variant="text" />

            <ul className="s-delivery" aria-label="Delivery">
              <li data-testid="pdp-ships-from">
                <strong>{shipsFromText(extras.ships_from)}</strong>
              </li>
              <li data-testid="pdp-delivery">{extras.delivery_estimate}</li>
              <li>{settings.duties_message}</li>
              <li>
                <Link href="/help/shipping">Shipping options</Link> · <Link href="/help/returns">{settings.return_window_days}-day returns</Link>
              </li>
            </ul>

            <details className="s-accordion" open>
              <summary>Description</summary>
              <p>{description || "Details coming soon."}</p>
            </details>
            {extras.material || extras.care ? (
              <details className="s-accordion">
                <summary>Material and care</summary>
                {extras.material ? <p>Material: {extras.material}</p> : null}
                {extras.care ? <p>Care: {extras.care}</p> : null}
              </details>
            ) : null}
            <details className="s-accordion">
              <summary>About {extras.vendor.name}</summary>
              <p>
                Designed and made by {extras.vendor.name}
                {extras.vendor.region ? ` in ${extras.vendor.region}` : ""}. <Link href={`/brands/${extras.vendor.slug}`}>Read their story</Link>
              </p>
            </details>
          </div>
        </div>
      </div>

      {extras.complete_the_look.length ? (
        <section className="h-container s-section" aria-labelledby="ctl-title">
          <h2 id="ctl-title">Complete the look</h2>
          <ul className="s-rail" data-testid="complete-the-look">
            {extras.complete_the_look.map((d) => (
              <li key={d.id} className="s-rail__item s-rail__item--card">
                <ProductCard doc={d} currency={currency} saved={saved.includes(d.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="reviews" className="h-container s-section" aria-labelledby="reviews-title">
        <h2 id="reviews-title">Reviews</h2>
        {reviews.count > 0 && reviews.average != null ? (
          <div className="s-reviews__summary">
            <p>
              <Stars value={reviews.average} /> <strong>{reviews.average.toFixed(1)}</strong> out of 5 from {reviews.count} review{reviews.count === 1 ? "" : "s"}
            </p>
            <FitSummary fit={reviews.fit} />
          </div>
        ) : (
          <p className="s-muted">No reviews yet. Be the first to share how it fits.</p>
        )}
        <ul className="s-reviews">
          {reviews.items.map((r) => (
            <li key={r.id} className="s-review">
              <p>
                <Stars value={r.rating} /> {r.title ? <strong>{r.title}</strong> : null}
              </p>
              <p>{r.body}</p>
              {r.fit ? <p className="s-small">Fit: {FIT_LABEL[r.fit]}</p> : null}
              {r.photos.length ? (
                <ul className="s-review__photos">
                  {r.photos.map((src, i) => (
                    <li key={src} className="s-review__photo">
                      <ProductImage src={src} alt={`Photo ${i + 1} from ${r.display_name}`} sizes="96px" />
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="s-small s-muted">
                {r.display_name}
                {r.verified_purchase ? " · Verified purchase" : ""} · <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "UTC" })}</time>
              </p>
            </li>
          ))}
        </ul>
        <details className="s-accordion">
          <summary>Write a review</summary>
          {signedIn ? (
            <ReviewForm productId={product.id} />
          ) : (
            <p>
              <Link href={`/account/login?next=${encodeURIComponent(`/products/${product.handle}#reviews`)}`}>Sign in</Link> to review this piece.
            </p>
          )}
        </details>
      </section>

      <RecentlyViewed
        current={{ handle: product.handle, title: product.title, brand: extras.vendor.name, thumbnail: product.thumbnail }}
        analytics={{ id: product.id, price: price.amount, currency: price.currency || currency }}
      />
    </main>
  )
}
