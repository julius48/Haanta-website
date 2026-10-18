import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { LoginForm } from "@/components/account/AuthForms"
import { getCustomer } from "@/lib/server/customer"

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ next?: string }> }

export default async function LoginPage({ searchParams }: Props) {
  await connection()
  const { next } = await searchParams
  const safe = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/account"
  if (await getCustomer()) redirect(safe)
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Sign in</h1>
      <LoginForm next={safe} />
      <p>
        New to Haanta? <Link href="/account/register">Create an account</Link>
      </p>
    </main>
  )
}
