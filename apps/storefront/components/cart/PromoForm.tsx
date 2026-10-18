"use client"

import { useActionState } from "react"
import { applyPromoAction, removePromoAction } from "@/app/actions/cart"
import type { ActionState } from "@/lib/types"

/** "Gift card or discount code": gift cards are issued as promotion codes, so both use the promotions endpoint. */
export function PromoForm({ applied, onApplied }: { applied: string[]; onApplied?: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const r = await applyPromoAction(prev, fd)
    if (r.status === "ok") onApplied?.()
    return r
  }, { status: "idle" })
  const [, remove] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const r = await removePromoAction(prev, fd)
    if (r.status === "ok") onApplied?.()
    return r
  }, { status: "idle" })
  const err = state.status === "error" ? (state.fieldErrors?.code ?? state.message) : null
  return (
    <div className="s-promo">
      <form action={action} className="s-promo__form" noValidate>
        <label htmlFor="promo-code" className="s-label">
          Gift card or discount code
        </label>
        <div className="s-newsletter__row">
          <input
            id="promo-code"
            name="code"
            className="s-input"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={64}
            aria-invalid={err ? true : undefined}
            aria-describedby="promo-msg"
            data-testid="promo-input"
          />
          <button type="submit" className="h-btn h-btn--secondary" disabled={pending} data-testid="promo-apply">
            Apply
          </button>
        </div>
        <p id="promo-msg" role="status" aria-live="polite" className={err ? "s-error" : "s-success"}>
          {err ?? (state.status === "ok" ? state.message : "")}
        </p>
      </form>
      {applied.length ? (
        <ul className="s-chips" aria-label="Applied codes">
          {applied.map((c) => (
            <li key={c}>
              <form action={remove}>
                <input type="hidden" name="code" value={c} />
                <button type="submit" className="s-chip">
                  {c}
                  <span className="h-sr-only"> (remove code)</span>
                  <span aria-hidden="true"> ×</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
