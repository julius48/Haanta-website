import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { listBrands } from "@/lib/server/catalog"
import type { BrandSummary } from "@/lib/types"

export const metadata: Metadata = {
  title: "Designers A–Z",
  description: "Every African fashion designer on Haanta, from Lagos to Accra.",
  alternates: { canonical: "/brands" },
  openGraph: { title: "Designers A–Z | Haanta", url: "/brands" },
}

export default async function BrandsPage() {
  await connection()
  const brands = await listBrands()
  const groups = new Map<string, BrandSummary[]>()
  for (const b of [...brands].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = /^[a-z]/i.test(b.name) ? b.name[0]!.toUpperCase() : "#"
    groups.set(letter, [...(groups.get(letter) ?? []), b])
  }
  const letters = [...groups.keys()]
  return (
    <main id="main" className="h-container s-page">
      <h1>Designers A–Z</h1>
      <p className="s-lead">Independent designers, each vetted by Haanta for quality and story.</p>
      {letters.length ? (
        <>
          <nav aria-label="Jump to letter" className="s-az">
            <ul>
              {letters.map((l) => (
                <li key={l}>
                  <a href={`#letter-${l}`}>{l}</a>
                </li>
              ))}
            </ul>
          </nav>
          {letters.map((l) => (
            <section key={l} aria-labelledby={`letter-${l}`} className="s-az__group">
              <h2 id={`letter-${l}`}>{l}</h2>
              <ul className="s-az__list">
                {groups.get(l)!.map((b) => (
                  <li key={b.id}>
                    <Link href={`/brands/${b.slug}`} data-testid="brand-link">
                      {b.name}
                    </Link>
                    {b.region ? <span className="s-small s-muted"> · {b.region}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <p>Our designer directory is loading. Please check back shortly.</p>
      )}
    </main>
  )
}
