import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Listing } from "@/components/listing/Listing"
import { Breadcrumbs } from "@/components/ui/Breadcrumbs"
import { JsonLd } from "@/components/ui/JsonLd"
import { breadcrumbJsonLd } from "@/lib/jsonld"
import { findCategory } from "@/lib/categories"
import { hasActiveFilters, parseFilters, type RawParams } from "@/lib/filters"
import { listingCanonical, loadListing } from "@/lib/server/listing"

type Props = { params: Promise<{ category: string[] }>; searchParams: Promise<RawParams> }

function resolve(segments: string[]) {
  const handle = segments.map((s) => decodeURIComponent(s).toLowerCase()).join("/")
  return findCategory(handle)
}

function crumbs(cat: NonNullable<ReturnType<typeof resolve>>) {
  return [
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    ...(cat.parent ? [{ name: cat.parent.name, path: `/shop/${cat.parent.handle}` }] : []),
    { name: cat.name, path: `/shop/${cat.handle}` },
  ]
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const cat = resolve((await params).category)
  if (!cat) return { title: "Not found" }
  const f = parseFilters(await searchParams)
  const title = cat.parent ? `${cat.parent.name}'s ${cat.name}` : cat.name
  return {
    title: `${title} by African designers`,
    description: `Shop ${title.toLowerCase()} from curated African fashion designers. Duties and taxes included for the US and Canada.`,
    alternates: { canonical: listingCanonical(`/shop/${cat.handle}`, f.page) },
    openGraph: { title: `${title} | Haanta`, url: `/shop/${cat.handle}` },
    robots: hasActiveFilters(f) ? { index: false, follow: true } : undefined,
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  await connection()
  const cat = resolve((await params).category)
  if (!cat) notFound()
  const data = await loadListing(await searchParams, { category: cat.handle })
  const items = crumbs(cat)
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(items)} />
      <Listing
        title={cat.parent ? `${cat.parent.name}'s ${cat.name}` : cat.name}
        ctx={{ basePath: `/shop/${cat.handle}`, categoryMode: "path" }}
        breadcrumbs={<Breadcrumbs items={items} />}
        {...data}
      />
    </>
  )
}
