"use client"

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="v-alert v-alert--error" role="alert">
      <p className="v-alert__title">We couldn&apos;t load this page.</p>
      <p>Haanta may be busy. Please try again in a moment.</p>
      <button type="button" className="h-btn h-btn--primary" onClick={reset}>
        Try again
      </button>
    </div>
  )
}
