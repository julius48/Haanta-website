import type { Metadata } from "next"
import Link from "next/link"
import { LoginForm } from "@/components/auth-forms"
import { Alert } from "@/components/fields"
import { Turnstile } from "@/components/turnstile"
import { safeNext } from "@/lib/auth-flow"

export const metadata: Metadata = { title: "Sign in" }

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  const next = safeNext(one("next")) ?? ""
  return (
    <>
      <h1>Sign in</h1>
      <p className="v-muted">Manage your Haanta store, products, orders and earnings.</p>
      {one("expired") ? <Alert tone="info" title="Please sign in again">Your session ended. Sign in to continue.</Alert> : null}
      {one("registered") ? <Alert tone="success" title="Application received">Thank you for applying. Sign in to set up two-factor authentication and your store.</Alert> : null}
      {one("reset") ? <Alert tone="success" title="Password updated">Sign in with your new password.</Alert> : null}
      {one("signed_out") ? <Alert tone="info" title="Signed out">You have been signed out.</Alert> : null}
      <div className="v-card">
        <LoginForm next={next} turnstile={<Turnstile />} />
      </div>
      <p>
        New to Haanta? <Link href="/register">Apply to become a partner</Link>
      </p>
    </>
  )
}
