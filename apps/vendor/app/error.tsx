"use client"

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="v-auth__body">
      <h1>Something went wrong</h1>
      <div className="v-alert v-alert--error" role="alert">
        <p>We couldn&apos;t reach Haanta just now. Please try again in a moment.</p>
      </div>
      <div className="v-row">
        <button type="button" className="h-btn h-btn--primary" onClick={reset}>
          Try again
        </button>
        <a className="h-btn h-btn--secondary" href="/login">
          Go to sign in
        </a>
      </div>
    </main>
  )
}
