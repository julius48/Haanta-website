"use client"

import { useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { palette } from "@haanta/ui"

const KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
let stripePromise: ReturnType<typeof loadStripe> | null = null
const getStripe = () => (stripePromise ??= loadStripe(KEY))

/**
 * Stripe Payment Element (cards, Apple Pay, Google Pay, Link, Klarna via automatic payment
 * methods). Card data goes straight to Stripe; we only receive the result.
 */
export function StripePayment({ clientSecret, onPaid }: { clientSecret: string; onPaid: () => Promise<string | null> }) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe" as const,
        variables: { colorPrimary: palette.brown, colorText: palette.ink, colorDanger: palette.red, borderRadius: "2px", fontFamily: "system-ui, sans-serif" },
      },
    }),
    [clientSecret],
  )
  return (
    <Elements stripe={getStripe()} options={options}>
      <StripeForm onPaid={onPaid} />
    </Elements>
  )
}

function StripeForm({ onPaid }: { onPaid: () => Promise<string | null> }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    const { error: err } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/checkout/complete` },
    })
    if (err) {
      setError(err.message ?? "Your payment could not be completed.")
      setBusy(false)
      return
    }
    const msg = await onPaid()
    if (msg) {
      setError(msg)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={pay} data-testid="stripe-form">
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      <p role="alert" className="s-error">
        {error}
      </p>
      <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={!stripe || busy}>
        {busy ? "Processing…" : "Pay now"}
      </button>
    </form>
  )
}
