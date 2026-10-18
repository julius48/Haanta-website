import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { getHomepage } from "@/lib/content"
import { TAGLINE } from "@/lib/site"

export const metadata: Metadata = {
  title: "About Haanta",
  description: `${TAGLINE}. Our pillars: Quality Assurance, Culture and Heritage, Empowerment, Community.`,
  alternates: { canonical: "/about" },
}

export default async function AboutPage() {
  await connection()
  const home = await getHomepage()
  return (
    <main id="main">
      <section className="s-hero s-hero--compact" aria-labelledby="about-title">
        <div className="h-container s-hero__inner">
          <p className="s-hero__eyebrow">Curated Africa</p>
          <h1 id="about-title" className="s-hero__title h-display">
            {TAGLINE}
          </h1>
        </div>
      </section>
      <div className="h-container s-page s-narrow s-prose">
        <p className="s-lead">
          Haanta brings together independent fashion designers from across Africa and delivers their work to customers in the US and Canada, with duties, taxes and customer care
          handled for you.
        </p>
        <h2>Our pillars</h2>
        <ul className="s-pillars s-pillars--stack">
          {home.pillars.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/brands" className="h-btn h-btn--primary">
            Meet the designers
          </Link>
        </p>
      </div>
    </main>
  )
}
