import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { ProductImage } from "@/components/ui/ProductImage"
import { listJournalPosts } from "@/lib/content"

export const metadata: Metadata = {
  title: "Journal: stories from the studios",
  description: "Culture, craft and fit guides from Haanta: stories behind African fashion and the designers who make it.",
  alternates: { canonical: "/journal" },
  openGraph: { title: "The Haanta Journal", url: "/journal" },
}

/** Editorial fallbacks for posts without a cover image. */
const COVERS = ["/images/editorial/editorial-adire-portrait.webp", "/images/editorial/editorial-womenswear-pink.webp", "/images/editorial/hero-menswear-brown.webp"]

export default async function JournalPage() {
  await connection()
  const posts = await listJournalPosts()
  return (
    <main id="main" className="h-container s-page">
      <header className="s-head">
        <p className="s-section__eyebrow">Style. Story. Soul.</p>
        <h1 className="s-head__title h-display">The Journal</h1>
        <p className="s-head__lead">Notes on craft, culture and fit, from the studios to your wardrobe.</p>
      </header>
      <ul className="s-journal-list">
        {posts.map((p, i) => (
          <li key={p.slug} className="s-journal-card">
            <span className="s-journal-card__media">
              <ProductImage src={p.coverImage ?? COVERS[i % COVERS.length]!} alt="" sizes="(min-width: 800px) 32vw, 100vw" priority={i === 0} />
            </span>
            <p className="s-journal-card__date">
              <time dateTime={p.publishedAt}>{new Date(p.publishedAt).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "long" })}</time> · {p.author}
            </p>
            <h2>
              <Link href={`/journal/${p.slug}`}>{p.title}</Link>
            </h2>
            <p>{p.excerpt}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
