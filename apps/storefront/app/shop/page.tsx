import type { Metadata } from "next"
import { connection } from "next/server"
import { Listing } from "@/components/listing/Listing"
import { JsonLd } from "@/components/ui/JsonLd"
import { breadcrumbJsonLd } from "@/lib/jsonld"
import { hasActiveFilters, parseFilters, type RawParams } from "@/lib/filters"
import { listingCanonical, loadListing } from "@/lib/server/listing"

type Props = { searchParams: Promise<RawParams> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams)
  const title = f.ships_from === "houston" ? "Ships from the US" : "Shop all African fashion"
  return {
    title,
    description: "Shop curated African fashion from independent designers: dresses, sets, menswear, accessories and more, with duties included for the US and Canada.",
    alternates: { canonical: listingCanonical("/shop", f.page) },
    openGraph: { title: `${title} | Haanta`, url: "/shop" },
    robots: hasActiveFilters(f) ? { index: false, follow: true } : undefined,
  }
}

export default async function ShopPage({ searchParams }: Props) {
  await connection()
  const data = await loadListing(await searchParams)
  const title = data.filters.ships_from === "houston" ? "Ships from the US" : "Shop all"
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }])} />
      <Listing
        title={title}
        intro={data.filters.ships_from === "houston" ? <p>Pieces already at our Houston hub: delivered in 2-5 working days.</p> : <p>Every piece hand-picked from designers across Africa.</p>}
        ctx={{ basePath: "/shop", categoryMode: "path" }}
        {...data}
      />
    </>
  )
}
