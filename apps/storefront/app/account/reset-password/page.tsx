import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { ResetPasswordForm } from "@/components/account/AuthForms"

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" }

type Props = { searchParams: Promise<{ token?: string; email?: string }> }

export default async function ResetPasswordPage({ searchParams }: Props) {
  await connection()
  const { token, email } = await searchParams
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 4096
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Choose a new password</h1>
      {valid ? (
        <ResetPasswordForm token={token} email={typeof email === "string" ? email.slice(0, 254) : ""} />
      ) : (
        <p>
          This link is incomplete or has expired. <Link href="/account/forgot-password">Request a new link</Link>.
        </p>
      )}
    </main>
  )
}
