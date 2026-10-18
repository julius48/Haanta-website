import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { RegisterForm } from "@/components/account/AuthForms"
import { getCustomer } from "@/lib/server/customer"

export const metadata: Metadata = { title: "Create an account", robots: { index: false, follow: false } }

export default async function RegisterPage() {
  await connection()
  if (await getCustomer()) redirect("/account")
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Create an account</h1>
      <RegisterForm />
      <p>
        Already have an account? <Link href="/account/login">Sign in</Link>
      </p>
    </main>
  )
}
