import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { listJournalPosts } from "@/lib/content"

export const metadata: Metadata = {
  title: "Journal: stories from the studios",
  description: "Culture, craft and fit guides from Haanta: stories behind African fashion and the designers who make it.",
  alternates: { canonical: "/journal" },
  openGraph: { title: "The Haanta Journal", url: "/journal" },
}

export default async function JournalPage() {
  await connection()
  const posts = await listJournalPosts()
  return (
    <main id="main" className="h-container s-page">
      <h1>The Journal</h1>
      <p className="s-lead">Style. Story. Soul. Notes on craft, culture and fit.</p>
      <ul className="s-journal-list">
        {posts.map((p) => (
          <li key={p.slug} className="s-journal-card">
            <p className="s-small s-muted">
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
