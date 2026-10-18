"use client"

import { useEffect, useRef, useState } from "react"
import { setCountryAction } from "@/app/actions/cart"
import { COUNTRIES, type Country } from "@/lib/site"

/** Compact "US · USD" switcher. Choosing a country submits the server action (no separate Update button). */
export function CountrySwitcher({ country }: { country: Country }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="s-country-switch" ref={ref}>
      <button
        type="button"
        className="s-country-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="country-menu"
        onClick={() => setOpen((v) => !v)}
        data-testid="country-button"
      >
        <span aria-hidden="true">{current.code.toUpperCase()}</span>
        <span aria-hidden="true">·</span>
        <span aria-hidden="true">{current.currency.toUpperCase()}</span>
        <span className="h-sr-only">
          Shipping to {current.name}, prices in {current.currency.toUpperCase()}. Change country
        </span>
      </button>
      {open ? (
        <form
          id="country-menu"
          action={setCountryAction}
          className="s-country-menu"
          data-testid="country-form"
        >
          <fieldset>
            <legend>Ship to</legend>
            {COUNTRIES.map((c) => (
              <label key={c.code} className="s-check">
                <input
                  type="radio"
                  name="country"
                  value={c.code}
                  defaultChecked={c.code === country}
                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                />
                <span>{c.name}</span>
                <span className="s-muted">{c.currency.toUpperCase()}</span>
              </label>
            ))}
          </fieldset>
          <noscript>
            <button type="submit" className="h-btn h-btn--primary">
              Update
            </button>
          </noscript>
        </form>
      ) : null}
    </div>
  )
}
