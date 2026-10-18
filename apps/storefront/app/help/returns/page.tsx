import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { getSettings } from "@/lib/server/catalog"

export const metadata: Metadata = {
  title: "Returns",
  description: "Haanta's returns policy for ready-to-wear, made-to-order and pre-order pieces.",
  alternates: { canonical: "/help/returns" },
}

export default async function ReturnsPage() {
  await connection()
  const s = await getSettings()
  return (
    <main id="main" className="h-container s-page s-narrow s-prose">
      <h1>Returns</h1>
      <p className="s-lead">We want you to love what you ordered. If something isn&apos;t right, here&apos;s how returns work.</p>
      <h2>Ready-to-wear</h2>
      <p>
        You can return unworn ready-to-wear pieces with their tags within {s.return_window_days} days of delivery. Contact us with your order number and we&apos;ll send return
        instructions. Refunds go back to your original payment method once the piece is checked at our Houston hub.
      </p>
      <h2>Made to order</h2>
      <p>
        Made-to-order pieces are cut to your measurements, so they can&apos;t be returned for change of mind. If there is a fault or the piece doesn&apos;t match the measurements you
        gave, we&apos;ll work with the designer to alter, remake or refund it.
      </p>
      <h2>Pre-order</h2>
      <p>You can cancel a pre-order for a full refund until it ships. After delivery, ready-to-wear return rules apply.</p>
      <h2 id="policies">Policies</h2>
      <p>
        Each designer may add their own notes on sizing and care on their <Link href="/brands">designer page</Link>. Prices include duties and taxes for the US and Canada, and we
        never add charges on delivery.
      </p>
      <p>
        Questions? <Link href="/track">Track your order</Link> or read our <Link href="/help/shipping">shipping guide</Link>.
      </p>
    </main>
  )
}
