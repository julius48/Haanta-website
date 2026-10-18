/** JSON-LD builders (pure). Rendered with the per-request CSP nonce by <JsonLd>. */
import { absoluteUrl, SITE_NAME, SOCIAL, TAGLINE } from "./site"

export type JsonLdObject = Record<string, unknown>

/** Escape so the payload cannot close the <script> element. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: `${TAGLINE}. Curated African fashion brands shipped to the US and Canada.`,
    sameAs: SOCIAL.map((s) => s.href),
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  }
}

export interface ProductLdInput {
  name: string
  description: string
  handle: string
  images: string[]
  brand: string
  sku?: string | null
  /** Major units, as returned by the backend. */
  price: number | null
  currency: string
  inStock: boolean
  isPreorder?: boolean
  rating?: { average: number | null; count: number }
  returnWindowDays?: number
}

export function productJsonLd(p: ProductLdInput): JsonLdObject {
  const ld: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description.slice(0, 5000),
    image: p.images.slice(0, 6),
    brand: { "@type": "Brand", name: p.brand },
    url: absoluteUrl(`/products/${p.handle}`),
  }
  if (p.sku) ld.sku = p.sku
  if (p.price != null) {
    ld.offers = {
      "@type": "Offer",
      url: absoluteUrl(`/products/${p.handle}`),
      priceCurrency: p.currency.toUpperCase(),
      price: p.price.toFixed(2),
      availability: p.isPreorder ? "https://schema.org/PreOrder" : p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: SITE_NAME },
      // Facts answer engines and merchant listings quote: where it ships and how returns work.
      shippingDetails: [
        { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" } },
        { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "CA" } },
      ],
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: ["US", "CA"],
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: p.returnWindowDays ?? 14,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    }
  }
  if (p.rating && p.rating.count > 0 && p.rating.average != null) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count, bestRating: 5, worstRating: 1 }
  }
  return ld
}

/** WebSite with a sitelinks search box (SearchAction). */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  }
}

/** FAQPage for help content (direct question → answer pairs that answer engines can quote). */
export function faqJsonLd(items: { q: string; a: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  }
}

/** ItemList of products on listing pages. */
export function itemListJsonLd(items: { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absoluteUrl(it.path) })),
  }
}
