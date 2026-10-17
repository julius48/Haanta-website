import type { Metadata } from "next"
import Link from "next/link"
import { InviteForm } from "@/components/auth-forms"
import { Alert } from "@/components/fields"
import { Turnstile } from "@/components/turnstile"

export const metadata: Metadata = { title: "Accept invite" }

export default async function InvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await searchParams).token
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 200
  return (
    <>
      <h1>Join your team on Haanta</h1>
      {valid ? (
        <>
          <p className="v-muted">You&apos;ve been invited to help manage a Haanta partner store. Create your login to accept.</p>
          <div className="v-card">
            <InviteForm token={token} turnstile={<Turnstile />} />
          </div>
        </>
      ) : (
        <Alert tone="error" title="This invite link is incomplete">
          <p>Open the link from your invite email again, or ask the store owner to contact Haanta for a new invite.</p>
        </Alert>
      )}
      <p>
        Already have a login? <Link href="/login">Sign in</Link>
      </p>
    </>
  )
}
