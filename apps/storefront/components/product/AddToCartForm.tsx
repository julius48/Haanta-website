"use client"

import Link from "next/link"
import { useId, useMemo, useState, useTransition } from "react"
import { Price } from "@haanta/ui"
import { addToCartAction } from "@/app/actions/cart"
import { validateMeasurements, validateOptionalMeasurements, MEASUREMENT_FIELDS, isMeasurementKey, type MeasurementKey } from "@/lib/measurements"
import { toMinor } from "@/lib/money"
import { track } from "@/lib/analytics"
import type { RequiredMeasurement, StoreProduct, StoreVariant } from "@/lib/types"

export interface AddToCartProps {
  handle: string
  productId: string
  title: string
  brand: string
  options: NonNullable<StoreProduct["options"]>
  variants: StoreVariant[]
  /** variant_id → fulfilment type, from the Haanta product endpoint. */
  variantFulfilment: Record<string, string>
  defaultFulfilment: string
  requiredMeasurements: RequiredMeasurement[]
  isPreorder: boolean
  compact?: boolean
  onAdded?: () => void
}

const isColour = (t: string) => /colou?r|hue/i.test(t)

function optionValue(v: StoreVariant, optionId: string, optionTitle: string): string | undefined {
  return v.options?.find(
    (o) => o.option_id === optionId || o.option?.id === optionId || o.option?.title === optionTitle,
  )?.value
}

export function AddToCartForm(p: AddToCartProps) {
  const uid = useId()
  const realOptions = p.options.filter(
    (o) =>
      (o.values?.length ?? 0) > 0 &&
      !(o.values!.length === 1 && /^default/i.test(o.values![0]!.value)),
  )
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    // Preselect single-value options and, when there is only one variant, everything.
    const init: Record<string, string> = {}
    const only = p.variants.length === 1 ? p.variants[0] : undefined
    for (const o of p.options) {
      const vals = o.values ?? []
      if (vals.length === 1) init[o.id] = vals[0]!.value
      else if (only) {
        const v = optionValue(only, o.id, o.title)
        if (v) init[o.id] = v
      }
    }
    return init
  })
  const [quantity, setQuantity] = useState(1)
  const [measure, setMeasure] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [pending, start] = useTransition()

  const variant = useMemo(() => {
    if (p.variants.length === 1) return p.variants[0]
    return p.variants.find(
      (v) =>
        p.options.every(
          (o) => !selected[o.id] || optionValue(v, o.id, o.title) === selected[o.id],
        ) && p.options.every((o) => !!selected[o.id]),
    )
  }, [p.variants, p.options, selected])

  // Variants matching this option value and the other current selections.
  const matching = (optionId: string, title: string, value: string) =>
    p.variants.filter(
      (v) =>
        optionValue(v, optionId, title) === value &&
        p.options.every(
          (o) =>
            o.id === optionId ||
            !selected[o.id] ||
            optionValue(v, o.id, o.title) === selected[o.id],
        ),
    )
  const inStock = (v: StoreVariant) => v.in_stock !== false
  const soldOut = variant ? !inStock(variant) : !p.variants.some(inStock)

  const fulfilment = variant
    ? (p.variantFulfilment[variant.id] ?? p.defaultFulfilment)
    : p.defaultFulfilment
  const needsMeasurements = fulfilment === "made_to_order" && p.requiredMeasurements.length > 0
  const requiredKeys = new Set(needsMeasurements ? p.requiredMeasurements.map((m) => m.key) : [])
  const optionalKeys = (Object.keys(MEASUREMENT_FIELDS) as MeasurementKey[]).filter((k) => !requiredKeys.has(k))
  const [customOpen, setCustomOpen] = useState(false)
  const price = variant?.calculated_price ?? null
  // Before a size is chosen, show the lowest price ("From $X") rather than hiding it.
  const fromPrice = useMemo(() => {
    const prices = p.variants
      .map((v) => v.calculated_price)
      .filter((x): x is NonNullable<typeof x> => x?.calculated_amount != null)
    if (!prices.length) return null
    return prices.reduce((a, b) => (b.calculated_amount! < a.calculated_amount! ? b : a))
  }, [p.variants])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!variant) {
      const missing = realOptions.filter((o) => !selected[o.id]).map((o) => o.title.toLowerCase())
      setMessage({
        kind: "error",
        text: missing.length
          ? `Please choose a ${missing.join(" and ")}.`
          : "This combination is not available.",
      })
      return
    }
    // Required (made to order) measurements plus any optional custom sizing the shopper filled in.
    const optional = validateOptionalMeasurements(measure)
    const required = needsMeasurements ? validateMeasurements(p.requiredMeasurements, measure) : null
    const fieldErrors = { ...(optional.ok ? {} : optional.errors), ...(required && !required.ok ? required.errors : {}) }
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors)
      setMessage({ kind: "error", text: required && !required.ok ? "Please add your measurements to continue." : "Please check your custom sizing." })
      if (Object.keys(fieldErrors).some((k) => !requiredKeys.has(k))) setCustomOpen(true)
      const first = Object.keys(fieldErrors)[0]
      if (first) setTimeout(() => document.getElementById(`${uid}-m-${first}`)?.focus(), 0)
      return
    }
    const merged = { ...(optional.ok ? optional.value : {}), ...(required?.ok ? required.value : {}) }
    const measurements = Object.keys(merged).length ? Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v)])) : undefined
    setErrors({})
    start(async () => {
      const res = await addToCartAction({
        handle: p.handle,
        variant_id: variant.id,
        quantity,
        measurements,
      })
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `Added to your bag (${res.count} item${res.count === 1 ? "" : "s"}).`,
        })
        track("add_to_cart", {
          currency: price?.currency_code?.toUpperCase(),
          value: price?.calculated_amount != null ? price.calculated_amount * quantity : undefined,
          items: [
            {
              item_id: p.productId,
              item_name: p.title,
              item_brand: p.brand,
              item_variant: variant.title ?? undefined,
              quantity,
            },
          ],
        })
        p.onAdded?.()
      } else {
        setErrors(res.fieldErrors ?? {})
        setMessage({ kind: "error", text: res.message })
      }
    })
  }

  return (
    <form
      className={`s-atc ${p.compact ? "s-atc--compact" : ""}`}
      onSubmit={submit}
      noValidate
      data-testid="add-to-cart-form"
    >
      <div className="s-atc__price" aria-live="polite">
        {price?.calculated_amount != null ? (
          <Price
            amountMinor={toMinor(price.calculated_amount)}
            currency={price.currency_code.toUpperCase()}
            compareAtMinor={
              price.original_amount != null && price.original_amount > price.calculated_amount
                ? toMinor(price.original_amount)
                : null
            }
          />
        ) : fromPrice?.calculated_amount != null ? (
          <span>
            <span className="s-muted s-small">From </span>
            <Price
              amountMinor={toMinor(fromPrice.calculated_amount)}
              currency={fromPrice.currency_code.toUpperCase()}
            />
          </span>
        ) : (
          <span className="s-muted">Choose options to see the price</span>
        )}
      </div>

      {realOptions.map((o) => (
        <fieldset key={o.id} className="s-options">
          <legend className="s-label">
            {o.title}
            {selected[o.id] ? <span className="s-muted">: {selected[o.id]}</span> : null}
          </legend>
          <div className="s-options__list">
            {(o.values ?? []).map((v) => {
              const id = `${uid}-${o.id}-${v.id}`
              const combos = matching(o.id, o.title, v.value)
              const ok = combos.some(inStock)
              const reason = combos.length ? "sold out" : "unavailable"
              return (
                <span key={v.id} className="s-option">
                  <input
                    type="radio"
                    id={id}
                    name={`${uid}-${o.id}`}
                    value={v.value}
                    checked={selected[o.id] === v.value}
                    onChange={() => setSelected((s) => ({ ...s, [o.id]: v.value }))}
                    disabled={!ok}
                    data-testid={`option-${o.title.toLowerCase()}`}
                  />
                  <label htmlFor={id} className="s-option__label">
                    {isColour(o.title) ? (
                      <span
                        className="s-swatch"
                        style={{ "--swatch": v.value.toLowerCase() } as React.CSSProperties}
                        aria-hidden="true"
                      />
                    ) : null}
                    {v.value}
                    {!ok ? <span className="h-sr-only"> ({reason})</span> : null}
                  </label>
                </span>
              )
            })}
          </div>
        </fieldset>
      ))}

      {needsMeasurements ? (
        <fieldset className="s-measure" data-testid="measurements">
          <legend className="s-label">Your measurements (inches)</legend>
          <p className="s-hint">
            This piece is made to order for you. Measure over light clothing; see our measuring
            guide in the Journal.
          </p>
          <div className="s-measure__grid">
            {p.requiredMeasurements.map((m) => {
              const f = isMeasurementKey(m.key) ? MEASUREMENT_FIELDS[m.key] : null
              const id = `${uid}-m-${m.key}`
              const min = m.min ?? f?.min
              const max = m.max ?? f?.max
              return (
                <div key={m.key} className={`s-field ${errors[m.key] ? "s-field--error" : ""}`}>
                  <label htmlFor={id} className="s-label">
                    {m.label} <span className="s-required">(required)</span>
                  </label>
                  <p id={`${id}-hint`} className="s-hint">
                    {min} to {max} in
                  </p>
                  <input
                    id={id}
                    name={m.key}
                    className="s-input"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={min}
                    max={max}
                    required
                    value={measure[m.key] ?? ""}
                    onChange={(e) => setMeasure((s) => ({ ...s, [m.key]: e.target.value }))}
                    aria-invalid={errors[m.key] ? true : undefined}
                    aria-describedby={`${id}-hint${errors[m.key] ? ` ${id}-error` : ""}`}
                    data-testid={`measurement-${m.key}`}
                  />
                  {errors[m.key] ? (
                    <p id={`${id}-error`} className="s-error">
                      {errors[m.key]}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <details
        className="s-custom-size"
        open={customOpen}
        onToggle={(e) => setCustomOpen(e.currentTarget.open)}
        data-testid="custom-sizing"
      >
        <summary>
          Custom sizing <span className="s-muted">(optional)</span>
        </summary>
        <p className="s-hint">
          Between sizes or want a tailored fit? Add any measurements you like (inches) and the designer will adjust
          the piece. Leave blank to order the standard size.
        </p>
        <div className="s-measure__grid">
          {optionalKeys.map((k) => {
            const f = MEASUREMENT_FIELDS[k]
            const id = `${uid}-m-${k}`
            return (
              <div key={k} className={`s-field ${errors[k] ? "s-field--error" : ""}`}>
                <label htmlFor={id} className="s-label">
                  {f.label}
                </label>
                <input
                  id={id}
                  name={k}
                  className="s-input"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={f.min}
                  max={f.max}
                  placeholder={`${f.min}–${f.max}`}
                  value={measure[k] ?? ""}
                  onChange={(e) => setMeasure((s) => ({ ...s, [k]: e.target.value }))}
                  aria-invalid={errors[k] ? true : undefined}
                  aria-describedby={errors[k] ? `${id}-error` : undefined}
                  data-testid={`custom-measurement-${k}`}
                />
                {errors[k] ? (
                  <p id={`${id}-error`} className="s-error">
                    {errors[k]}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className={`s-field ${errors.notes ? "s-field--error" : ""}`}>
          <label htmlFor={`${uid}-m-notes`} className="s-label">
            Notes for the designer
          </label>
          <textarea
            id={`${uid}-m-notes`}
            className="s-input"
            maxLength={300}
            rows={2}
            placeholder="For example: longer sleeves, relaxed fit through the hips"
            value={measure.notes ?? ""}
            onChange={(e) => setMeasure((s) => ({ ...s, notes: e.target.value }))}
          />
          {errors.notes ? <p className="s-error">{errors.notes}</p> : null}
        </div>
      </details>

      <div className="s-atc__row">
        <div className="s-field s-field--qty">
          <label htmlFor={`${uid}-qty`} className="s-label">
            Quantity
          </label>
          <select
            id={`${uid}-qty`}
            className="s-input"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-btn h-btn--primary s-atc__submit"
          disabled={pending || soldOut}
          data-testid="add-to-cart"
        >
          {soldOut ? "Sold out" : pending ? "Adding…" : p.isPreorder ? "Pre-order" : "Add to bag"}
        </button>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="s-atc__status"
        data-testid="add-to-cart-status"
      >
        {message ? (
          <p className={message.kind === "error" ? "s-error" : "s-success"}>
            {message.text} {message.kind === "ok" ? <Link href="/cart">View bag</Link> : null}
          </p>
        ) : null}
      </div>
    </form>
  )
}
