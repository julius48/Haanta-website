"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Field } from "@/components/ui/Field"
import { PromoForm } from "@/components/cart/PromoForm"
import { completeCartAction, mockPaymentAction, selectShippingAction, submitAddressAction, type AddressInput, type PaymentInit } from "@/app/actions/checkout"
import { formatMajor } from "@/lib/money"
import { track } from "@/lib/analytics"
import type { Address, ShippingQuote } from "@/lib/types"

const StripePayment = dynamic(() => import("./StripePayment").then((m) => m.StripePayment), { ssr: false, loading: () => <p role="status">Loading secure payment…</p> })
const PayPalButtons = dynamic(() => import("./PayPalButtons").then((m) => m.PayPalButtons), { ssr: false })

type Step = "address" | "shipping" | "payment"

const TEST_METHODS = [
  { value: "pm_card_visa", label: "Visa: payment succeeds" },
  { value: "pm_card_chargeDeclined", label: "Card declined" },
  { value: "pm_card_riskLevelElevated", label: "Succeeds, elevated fraud risk (held for review)" },
]

const REGION_LABEL: Record<string, { province: string; postal: string; provinceHint: string }> = {
  us: { province: "State", postal: "ZIP code", provinceHint: "Two-letter code, e.g. TX" },
  ca: { province: "Province", postal: "Postal code", provinceHint: "Two-letter code, e.g. ON" },
  mx: { province: "State", postal: "Postal code", provinceHint: "e.g. CMX or Jalisco" },
}

export function CheckoutFlow({
  email,
  address,
  country,
  appliedCodes,
  itemCount,
  cartValue,
  currency,
}: {
  email: string
  address: Address | null
  country: "us" | "ca" | "mx"
  appliedCodes: string[]
  itemCount: number
  cartValue: number
  currency: string
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("address")
  const [form, setForm] = useState<AddressInput>({
    email,
    first_name: address?.first_name ?? "",
    last_name: address?.last_name ?? "",
    address_1: address?.address_1 ?? "",
    address_2: address?.address_2 ?? "",
    city: address?.city ?? "",
    province: address?.province ?? "",
    postal_code: address?.postal_code ?? "",
    country_code: (address?.country_code as "us" | "ca" | "mx" | undefined) ?? country,
    phone: address?.phone ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [quote, setQuote] = useState<ShippingQuote | null>(null)
  const [choice, setChoice] = useState<string>("")
  const [payment, setPayment] = useState<PaymentInit | null>(null)
  const [testMethod, setTestMethod] = useState("pm_card_visa")
  const [pending, start] = useTransition()
  const heading = useRef<HTMLHeadingElement>(null)
  const began = useRef(false)

  useEffect(() => {
    if (began.current) return
    began.current = true
    track("begin_checkout", { currency: currency.toUpperCase(), value: cartValue })
  }, [currency, cartValue])

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submitAddress = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await submitAddressAction(form)
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {})
        setMessage(r.message)
        const first = Object.keys(r.fieldErrors ?? {})[0]
        if (first) document.getElementById(`co-${first}`)?.focus()
        return
      }
      setErrors({})
      setQuote(r.quote)
      setChoice(r.quote.options[0]?.code ?? "")
      setPayment(null)
      setStep("shipping")
    })
  }

  const submitShipping = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quote || !choice) {
      setMessage("Choose a delivery option.")
      return
    }
    setMessage(null)
    start(async () => {
      const r = await selectShippingAction({ option_id: quote.shipping_option_id, quote_code: choice })
      if (!r.ok) {
        setMessage(r.message)
        return
      }
      setPayment(r.payment)
      setStep("payment")
    })
  }

  const finish = useCallback(async (): Promise<string | null> => {
    const r = await completeCartAction()
    if (!r.ok) return r.message
    track("purchase", { transaction_id: String(r.order.display_id), currency: r.order.currency_code.toUpperCase(), value: r.order.total })
    router.push(r.redirectTo)
    return null
  }, [router])

  const payTest = () => {
    setMessage(null)
    start(async () => {
      const r = await mockPaymentAction(testMethod)
      if (!r.ok) {
        setMessage(r.message)
        return
      }
      track("purchase", { transaction_id: String(r.order.display_id), currency: r.order.currency_code.toUpperCase(), value: r.order.total })
      router.push(r.redirectTo)
    })
  }

  const labels = REGION_LABEL[form.country_code] ?? REGION_LABEL.us!
  const chosen = quote?.options.find((o) => o.code === choice)

  return (
    <div className="s-checkout__steps">
      <div role="alert" aria-live="assertive" className={message ? "s-notice s-notice--error" : "s-form-msg-empty"} data-testid="checkout-message">
        {message}
      </div>

      <section className={`s-step ${step === "address" ? "is-current" : "is-done"}`} aria-labelledby="step-address">
        <h2 id="step-address" tabIndex={-1} ref={step === "address" ? heading : undefined}>
          1. Contact and delivery address
        </h2>
        {step === "address" ? (
          <form onSubmit={submitAddress} noValidate data-testid="address-form">
            <Field id="co-email" label="Email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} error={errors.email} hint="For your order confirmation and tracking." data-testid="checkout-email" />
            <div className="s-field">
              <label htmlFor="co-country_code" className="s-label">
                Country <span className="s-required">(required)</span>
              </label>
              <select id="co-country_code" className="s-input" autoComplete="country" value={form.country_code} onChange={set("country_code")} data-testid="checkout-country">
                <option value="us">United States</option>
                <option value="ca">Canada</option>
                <option value="mx">Mexico</option>
              </select>
            </div>
            <div className="s-form-row">
              <Field id="co-first_name" label="First name" autoComplete="given-name" required value={form.first_name} onChange={set("first_name")} error={errors.first_name} data-testid="checkout-first-name" />
              <Field id="co-last_name" label="Last name" autoComplete="family-name" required value={form.last_name} onChange={set("last_name")} error={errors.last_name} data-testid="checkout-last-name" />
            </div>
            <Field id="co-address_1" label="Street address" autoComplete="address-line1" required value={form.address_1} onChange={set("address_1")} error={errors.address_1} data-testid="checkout-address1" />
            <Field id="co-address_2" label="Apartment, suite (optional)" autoComplete="address-line2" value={form.address_2 ?? ""} onChange={set("address_2")} />
            <div className="s-form-row s-form-row--3">
              <Field id="co-city" label="City" autoComplete="address-level2" required value={form.city} onChange={set("city")} error={errors.city} data-testid="checkout-city" />
              <Field id="co-province" label={labels.province} hint={labels.provinceHint} autoComplete="address-level1" required value={form.province} onChange={set("province")} error={errors.province} data-testid="checkout-province" />
              <Field id="co-postal_code" label={labels.postal} autoComplete="postal-code" required value={form.postal_code} onChange={set("postal_code")} error={errors.postal_code} data-testid="checkout-postal" />
            </div>
            <Field id="co-phone" label="Phone" type="tel" autoComplete="tel" required value={form.phone} onChange={set("phone")} error={errors.phone} hint="Only shared with the courier." data-testid="checkout-phone" />
            <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending} data-testid="address-submit">
              {pending ? "Getting delivery options…" : "Continue to delivery"}
            </button>
          </form>
        ) : (
          <div className="s-step__summary">
            <p>
              {form.email}
              <br />
              {form.first_name} {form.last_name}, {form.address_1}, {form.city} {form.province.toUpperCase()} {form.postal_code.toUpperCase()}, {form.country_code.toUpperCase()}
            </p>
            <button type="button" className="s-link-btn" onClick={() => setStep("address")}>
              Edit<span className="h-sr-only"> address</span>
            </button>
          </div>
        )}
      </section>

      <section className={`s-step ${step === "shipping" ? "is-current" : step === "payment" ? "is-done" : ""}`} aria-labelledby="step-shipping">
        <h2 id="step-shipping" tabIndex={-1} ref={step === "shipping" ? heading : undefined}>
          2. Delivery
        </h2>
        {step === "shipping" && quote ? (
          quote.options.length === 0 ? (
            <p className="s-notice s-notice--error" data-testid="no-shipping-options">
              Sorry, we can&apos;t deliver this bag to that address yet. Try a different address or remove US-stock items for Mexico.
            </p>
          ) : (
            <form onSubmit={submitShipping} data-testid="shipping-form">
              <fieldset>
                <legend className="s-label">Choose a delivery option</legend>
                <ul className="s-ship-options">
                  {quote.options.map((o) => (
                    <li key={o.code}>
                      <label className="s-ship-option" data-testid="shipping-option" data-code={o.code}>
                        <input type="radio" name="shipping" value={o.code} checked={choice === o.code} onChange={() => setChoice(o.code)} />
                        <span className="s-ship-option__text">
                          <span className="s-ship-option__title">{o.title}</span>
                          {o.delivery_time && o.delivery_time !== o.title ? <span className="s-small s-muted">{o.delivery_time}</span> : null}
                        </span>
                        <span className="s-ship-option__price" data-testid="shipping-option-price">
                          {o.amount === 0 ? "Free" : formatMajor(o.amount, o.currency || quote.currency)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <p className="s-small">{quote.duties_message}</p>
              <button type="submit" className="h-btn h-btn--primary s-btn-block" disabled={pending} data-testid="shipping-submit">
                {pending ? "Saving…" : "Continue to payment"}
              </button>
            </form>
          )
        ) : step === "payment" && chosen ? (
          <div className="s-step__summary">
            <p>
              {chosen.title}: {chosen.amount === 0 ? "Free" : formatMajor(chosen.amount, chosen.currency || currency)}
            </p>
            <button type="button" className="s-link-btn" onClick={() => setStep("shipping")}>
              Change<span className="h-sr-only"> delivery option</span>
            </button>
          </div>
        ) : null}
      </section>

      <section className={`s-step ${step === "payment" ? "is-current" : ""}`} aria-labelledby="step-payment">
        <h2 id="step-payment" tabIndex={-1} ref={step === "payment" ? heading : undefined}>
          3. Payment
        </h2>
        {step === "payment" && payment ? (
          <div data-testid="payment-step">
            <PromoForm
              applied={appliedCodes}
              onApplied={() => {
                // Totals changed: the delivery quote must be refreshed.
                setStep("address")
                setMessage("Your code changed the total. Please confirm your delivery option again.")
              }}
            />
            {payment.provider === "stripe" && payment.client_secret ? (
              <StripePayment clientSecret={payment.client_secret} onPaid={finish} />
            ) : payment.provider === "mock" ? (
              <div className="s-test-pay" data-testid="test-payment">
                <h3>Test payment</h3>
                <p className="s-small">Stripe is not configured, so this local build uses Stripe test payment methods. No real money moves.</p>
                <div className="s-field">
                  <label htmlFor="test-method" className="s-label">
                    Test payment method
                  </label>
                  <select id="test-method" className="s-input" value={testMethod} onChange={(e) => setTestMethod(e.target.value)} data-testid="test-payment-method">
                    {TEST_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="h-btn h-btn--primary s-btn-block" disabled={pending} onClick={payTest} data-testid="test-payment-submit">
                  {pending ? "Placing order…" : `Place order (${itemCount} item${itemCount === 1 ? "" : "s"})`}
                </button>
              </div>
            ) : (
              <p className="s-notice s-notice--error">Payment is unavailable right now. Please try again shortly.</p>
            )}
            <PayPalButtons currency={currency} onApproved={finish} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
