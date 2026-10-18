"use client"

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="h-container s-page s-narrow">
      <h1>Something went wrong</h1>
      <p>Sorry, this page didn&apos;t load. Please try again.</p>
      <button type="button" className="h-btn h-btn--primary" onClick={reset}>
        Try again
      </button>
    </main>
  )
}
