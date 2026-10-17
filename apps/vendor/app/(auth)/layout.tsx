import Link from "next/link"
import { connection } from "next/server"
import { Wordmark } from "@haanta/ui"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return (
    <div className="v-auth">
      <header className="v-auth__head">
        <div className="h-container">
          <Link href="/login" className="v-brand">
            <Wordmark tone="tan" />
            <span className="v-brand__label">Partner Portal</span>
          </Link>
        </div>
      </header>
      <main id="main" className="v-auth__body" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
