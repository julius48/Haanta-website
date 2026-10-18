import type { Metadata } from "next"
import { connection } from "next/server"
import { ForgotPasswordForm } from "@/components/account/AuthForms"

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } }

export default async function ForgotPasswordPage() {
  await connection()
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Reset your password</h1>
      <p>Enter the email you use for Haanta and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
    </main>
  )
}
