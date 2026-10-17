import type { Metadata } from "next"
import Link from "next/link"
import { UpdatePasswordForm } from "@/components/auth-forms"
import { Alert } from "@/components/fields"

export const metadata: Metadata = { title: "Choose a new password" }

/** Opened from the reset email: /reset-password/update?token=…&email=… */
export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const token = typeof sp.token === "string" ? sp.token : ""
  const email = typeof sp.email === "string" ? sp.email : ""
  return (
    <>
      <h1>Choose a new password</h1>
      {token ? (
        <div className="v-card">
          <UpdatePasswordForm token={token} email={email} />
        </div>
      ) : (
        <Alert tone="error" title="This reset link is incomplete">
          <p>
            Open the link from your email again or <Link href="/reset-password">request a new one</Link>.
          </p>
        </Alert>
      )}
    </>
  )
}
