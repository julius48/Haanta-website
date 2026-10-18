import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Breadcrumbs } from "@/components/ui/Breadcrumbs"
import { JsonLd } from "@/components/ui/JsonLd"
import { getJournalPost } from "@/lib/content"
import { breadcrumbJsonLd } from "@/lib/jsonld"
import { absoluteUrl, SITE_NAME } from "@/lib/site"

type Props = { params: Promise<{ slug: string }> }

const valid = (s: string) => /^[a-z0-9-]{1,120}$/.test(s)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = valid(slug) ? await getJournalPost(slug) : null
  if (!post) return { title: "Story not found", robots: { index: false } }
  return {
    title: post.title,
    description: post.excerpt.slice(0, 160),
    alternates: { canonical: `/journal/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.excerpt, url: `/journal/${post.slug}`, publishedTime: post.publishedAt, images: post.coverImage ? [post.coverImage] : undefined },
  }
}

export default async function JournalPostPage({ params }: Props) {
  await connection()
  const { slug } = await params
  const post = valid(slug) ? await getJournalPost(slug) : null
  if (!post) notFound()
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Journal", path: "/journal" },
    { name: post.title, path: `/journal/${post.slug}` },
  ]
  return (
    <main id="main" className="h-container s-page s-narrow">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.publishedAt,
            author: { "@type": "Organization", name: post.author },
            publisher: { "@type": "Organization", name: SITE_NAME },
            mainEntityOfPage: absoluteUrl(`/journal/${post.slug}`),
          },
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <Breadcrumbs items={crumbs} />
      <article className="s-article">
        <header>
          <h1>{post.title}</h1>
          <p className="s-small s-muted">
            <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "long" })}</time> · {post.author}
          </p>
          <p className="s-lead">{post.excerpt}</p>
        </header>
        {post.body.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </article>
      <p>
        <Link href="/journal">More stories</Link>
      </p>
    </main>
  )
}
