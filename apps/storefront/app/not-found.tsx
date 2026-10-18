import Link from "next/link"

export default function NotFound() {
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>We couldn&apos;t find that page</h1>
      <p>It may have moved, or the piece may have sold out.</p>
      <p>
        <Link href="/shop" className="h-btn h-btn--primary">
          Shop all
        </Link>{" "}
        <Link href="/search" className="h-btn h-btn--secondary">
          Search
        </Link>
      </p>
    </main>
  )
}
