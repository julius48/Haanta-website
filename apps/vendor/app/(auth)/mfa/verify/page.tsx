import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { MfaVerify } from "@/components/mfa-forms"
import { SignOutButton } from "@/components/sign-out"
import { nextStep } from "@/lib/auth-flow"
import { getMe } from "@/lib/server/session"

export const metadata: Metadata = { title: "Two-factor verification" }

export default async function MfaVerifyPage() {
  const me = await getMe()
  if (!me) redirect("/login?expired=1")
  if (!me.mfa.enrolled) redirect("/mfa/setup")
  if (me.mfa.verified) redirect(nextStep(me))
  return (
    <>
      <h1>Enter your code</h1>
      <p className="v-muted">Open your authenticator app and enter the 6-digit code for Haanta.</p>
      <div className="v-card">
        <MfaVerify />
      </div>
      <p className="v-small v-muted">Lost your phone and your recovery codes? Contact Haanta to reset two-factor authentication.</p>
      <SignOutButton variant="ghost" />
    </>
  )
}
