import type { Metadata } from "next"
import Link from "next/link"
import { RegisterForm } from "@/components/auth-forms"
import { Turnstile } from "@/components/turnstile"

export const metadata: Metadata = { title: "Apply to sell" }

export default function RegisterPage() {
  return (
    <>
      <h1>Apply to sell on Haanta</h1>
      <p className="v-muted">
        Create your partner account. Haanta reviews every brand; while you wait you can set up your store page, size charts and product drafts.
      </p>
      <div className="v-card">
        <RegisterForm turnstile={<Turnstile />} />
      </div>
      <p>
        Already a partner? <Link href="/login">Sign in</Link>
      </p>
    </>
  )
}
