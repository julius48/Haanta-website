import type { Metadata } from "next"
import Link from "next/link"
import { ResetRequestForm } from "@/components/auth-forms"
import { Turnstile } from "@/components/turnstile"

export const metadata: Metadata = { title: "Reset password" }

export default function ResetPasswordPage() {
  return (
    <>
      <h1>Reset your password</h1>
      <p className="v-muted">Enter the email you sign in with and we&apos;ll send you a link to choose a new password.</p>
      <div className="v-card">
        <ResetRequestForm turnstile={<Turnstile />} />
      </div>
      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  )
}
