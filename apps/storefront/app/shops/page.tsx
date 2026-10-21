import type { Metadata } from "next"
import { connection } from "next/server"
import { ShopTiles } from "@/components/home/ShopTiles"
import { listShops } from "@/lib/content"
import { shopCoverImages } from "@/lib/server/catalog"
import { getRegion } from "@/lib/server/region"

export const metadata: Metadata = {
  title: "Curated shops",
  description: "Six curated edits of African fashion: Special Occasions, Elevated Essentials, Casual Chic, Work From Office, Bold Prints and Vacay Bae.",
  alternates: { canonical: "/shops" },
}

export default async function ShopsPage() {
  await connection()
  const [shops, { currency }] = await Promise.all([listShops(), getRegion()])
  const images = await shopCoverImages(shops.map((s) => s.slug), currency)
  return (
    <main id="main" className="h-container s-page">
      <header className="s-head">
        <p className="s-section__eyebrow">Curated by Haanta</p>
        <h1 className="s-head__title h-display">The Edits</h1>
        <p className="s-head__lead">Edits by occasion and mood, hand-picked by the Haanta team.</p>
      </header>
      <ShopTiles shops={shops} images={images} headingLevel="h2" />
    </main>
  )
}
