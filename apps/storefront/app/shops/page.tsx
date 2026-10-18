import type { Metadata } from "next"
import { connection } from "next/server"
import { ShopTiles } from "@/components/home/ShopTiles"
import { listShops } from "@/lib/content"

export const metadata: Metadata = {
  title: "Curated shops",
  description: "Six curated edits of African fashion: Special Occasions, Elevated Essentials, Casual Chic, Work From Office, Bold Prints and Vacay Bae.",
  alternates: { canonical: "/shops" },
}

export default async function ShopsPage() {
  await connection()
  const shops = await listShops()
  return (
    <main id="main" className="h-container s-page">
      <h1>Curated shops</h1>
      <p className="s-lead">Edits by occasion and mood, hand-picked by the Haanta team.</p>
      <ShopTiles shops={shops} headingLevel="h2" />
    </main>
  )
}
