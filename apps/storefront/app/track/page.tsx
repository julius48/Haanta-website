import type { Metadata } from "next"
import { connection } from "next/server"
import { TrackForm } from "@/components/account/TrackForm"

export const metadata: Metadata = {
  title: "Track your order",
  description: "Track your Haanta order with your order number and email.",
  alternates: { canonical: "/track" },
}

export default async function TrackPage() {
  await connection()
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Track your order</h1>
      <p>Enter your order number and the email you used at checkout.</p>
      <TrackForm />
    </main>
  )
}
