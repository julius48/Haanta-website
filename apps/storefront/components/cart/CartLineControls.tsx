"use client"

import { useActionState } from "react"
import { removeLineItemAction, updateLineItemAction } from "@/app/actions/cart"
import type { ActionState } from "@/lib/types"

export function CartLineControls({ lineId, quantity, title }: { lineId: string; quantity: number; title: string }) {
  const [state, update, pendingU] = useActionState<ActionState, FormData>(updateLineItemAction, { status: "idle" })
  const [rstate, remove, pendingR] = useActionState<ActionState, FormData>(removeLineItemAction, { status: "idle" })
  const msg = state.status === "error" ? state.message : rstate.status === "error" ? rstate.message : null
  return (
    <div className="s-line__controls">
      <form action={update} className="s-line__qty">
        <input type="hidden" name="line_id" value={lineId} />
        <label htmlFor={`qty-${lineId}`} className="s-small">
          Quantity<span className="h-sr-only"> for {title}</span>
        </label>
        <select
          id={`qty-${lineId}`}
          name="quantity"
          defaultValue={quantity}
          className="s-input"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={pendingU}
          data-testid="line-quantity"
        >
          {Array.from({ length: Math.max(10, quantity) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="h-btn h-btn--secondary">
            Update
          </button>
        </noscript>
      </form>
      <form action={remove}>
        <input type="hidden" name="line_id" value={lineId} />
        <button type="submit" className="s-link-btn" disabled={pendingR} data-testid="line-remove">
          Remove<span className="h-sr-only"> {title}</span>
        </button>
      </form>
      <p role="status" aria-live="polite" className={msg ? "s-error" : "h-sr-only"}>
        {msg ?? (state.status === "ok" ? state.message : rstate.status === "ok" ? rstate.message : "")}
      </p>
    </div>
  )
}
