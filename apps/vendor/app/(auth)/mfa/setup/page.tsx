import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { MfaSetup } from "@/components/mfa-forms"
import { SignOutButton } from "@/components/sign-out"
import { nextStep } from "@/lib/auth-flow"
import { getMe } from "@/lib/server/session"

export const metadata: Metadata = { title: "Set up two-factor authentication" }

export default async function MfaSetupPage() {
  const me = await getMe()
  if (!me) redirect("/login?expired=1")
  if (me.mfa.enrolled) redirect(nextStep(me))
  return (
    <>
      <h1>Protect your account</h1>
      <p className="v-muted">Every Haanta partner signs in with a password and a code from an authenticator app. This keeps your store and earnings safe.</p>
      <div className="v-card">
        <MfaSetup />
      </div>
      <SignOutButton variant="ghost" />
    </>
  )
}
