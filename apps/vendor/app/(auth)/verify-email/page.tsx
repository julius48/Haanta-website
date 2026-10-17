import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Alert } from "@/components/fields"
import { ResendVerification, VerifyEmailConfirm } from "@/components/mfa-forms"
import { SignOutButton } from "@/components/sign-out"
import { getMe } from "@/lib/server/session"

export const metadata: Metadata = { title: "Verify your email" }

/** Without a token: "check your inbox" + resend. With ?token= (from the email): confirm button. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const token = typeof sp.token === "string" ? sp.token : ""
  const here = token ? `/verify-email?token=${encodeURIComponent(token)}` : "/verify-email"
  const me = await getMe()
  if (!me) redirect(`/login?next=${encodeURIComponent(here)}`)
  if (!me.mfa.enrolled) redirect("/mfa/setup")
  if (!me.mfa.verified) redirect("/mfa/verify")
  if (me.user.email_verified) redirect("/dashboard")
  return (
    <>
      <h1>Verify your email</h1>
      {token ? (
        <div className="v-card">
          <p>
            Confirm that <strong>{me.user.email}</strong> is your email address.
          </p>
          <VerifyEmailConfirm token={token} />
        </div>
      ) : (
        <div className="v-card">
          <Alert tone="info" title="Check your inbox">
            <p>
              We sent a verification link to <strong>{me.user.email}</strong>. Open it on this device to continue.
            </p>
          </Alert>
          <p>Didn&apos;t get it? Check your spam folder or send a new link.</p>
          <ResendVerification />
        </div>
      )}
      <SignOutButton variant="ghost" />
    </>
  )
}
