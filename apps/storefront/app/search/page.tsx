import type { Metadata } from "next"
import { connection } from "next/server"
import { Listing } from "@/components/listing/Listing"
import { parseFilters, type RawParams } from "@/lib/filters"
import { loadListing } from "@/lib/server/listing"

type Props = { searchParams: Promise<RawParams> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams)
  return {
    title: f.q ? `Search: ${f.q}` : "Search",
    description: "Search curated African fashion on Haanta.",
    alternates: { canonical: "/search" },
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  await connection()
  const data = await loadListing(await searchParams)
  const q = data.filters.q
  return (
    <Listing
      title={q ? `Results for “${q}”` : "Search Haanta"}
      intro={
        !q ? (
          <form action="/search" method="get" role="search" className="s-search s-search--page">
            <label htmlFor="page-search" className="s-label">
              What are you looking for?
            </label>
            <input id="page-search" name="q" type="search" className="s-input" maxLength={100} />
            <button type="submit" className="h-btn h-btn--primary">
              Search
            </button>
          </form>
        ) : undefined
      }
      ctx={{ basePath: "/search", categoryMode: "param" }}
      {...data}
    />
  )
}
