import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { JsonLd } from "@/components/ui/JsonLd"
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonld"
import { FAQ, type FaqItem } from "@/lib/faq"

export const metadata: Metadata = {
  title: "Help and FAQs: shipping, duties, returns and sizing",
  description: "Answers about Haanta shipping to the US and Canada, duties and taxes, returns, sizing, made-to-order and pre-order pieces.",
  alternates: { canonical: "/faq" },
}

const TOPICS: { key: FaqItem["topic"]; title: string }[] = [
  { key: "shipping", title: "Shipping and duties" },
  { key: "returns", title: "Returns" },
  { key: "sizing", title: "Sizing and made to order" },
  { key: "orders", title: "Orders and payment" },
  { key: "about", title: "About Haanta" },
]

export default async function FaqPage() {
  await connection()
  return (
    <main id="main" className="h-container s-page">
      <JsonLd data={[faqJsonLd(FAQ), breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "FAQs", path: "/faq" }])]} />
      <div className="s-narrow">
        <div className="s-center-head">
          <span className="s-section__eyebrow">Help centre</span>
          <h1 className="s-listing__title">Frequently asked questions</h1>
        </div>
        {TOPICS.map((t) => (
          <section key={t.key} aria-labelledby={`faq-${t.key}`} className="s-faq-group">
            <h2 id={`faq-${t.key}`}>{t.title}</h2>
            {FAQ.filter((f) => f.topic === t.key).map((f) => (
              <details key={f.q} className="s-accordion">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>
        ))}
        <p className="s-section">
          Still need help? See <Link href="/help/shipping">shipping</Link>, <Link href="/help/returns">returns</Link> or <Link href="/track">track your order</Link>.
        </p>
      </div>
    </main>
  )
}
