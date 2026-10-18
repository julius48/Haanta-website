"use client"

import { useActionState } from "react"
import { submitReviewAction } from "@/app/actions/account"
import { FormMessage } from "@/components/ui/Field"
import type { ActionState } from "@/lib/types"

export function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitReviewAction, { status: "idle" })
  const fe = state.status === "error" ? (state.fieldErrors ?? {}) : {}
  if (state.status === "ok") return <FormMessage state={state} />
  return (
    <form action={action} className="s-review-form" noValidate>
      <input type="hidden" name="product_id" value={productId} />
      <fieldset className="s-rating-input">
        <legend className="s-label">Your rating (required)</legend>
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n} className="s-check">
            <input type="radio" name="rating" value={n} required /> {n} star{n === 1 ? "" : "s"}
          </label>
        ))}
        {fe.rating ? <p className="s-error">{fe.rating}</p> : null}
      </fieldset>
      <fieldset>
        <legend className="s-label">How did it fit?</legend>
        <label className="s-check">
          <input type="radio" name="fit" value="runs_small" /> Runs small
        </label>
        <label className="s-check">
          <input type="radio" name="fit" value="true_to_size" /> True to size
        </label>
        <label className="s-check">
          <input type="radio" name="fit" value="runs_large" /> Runs large
        </label>
      </fieldset>
      <div className="s-field">
        <label htmlFor="review-title" className="s-label">
          Title
        </label>
        <input id="review-title" name="title" className="s-input" maxLength={120} />
      </div>
      <div className={`s-field ${fe.body ? "s-field--error" : ""}`}>
        <label htmlFor="review-body" className="s-label">
          Your review <span className="s-required">(required)</span>
        </label>
        <textarea id="review-body" name="body" className="s-input" rows={4} minLength={10} maxLength={3000} required aria-invalid={fe.body ? true : undefined} aria-describedby={fe.body ? "review-body-error" : undefined} />
        {fe.body ? (
          <p id="review-body-error" className="s-error">
            {fe.body}
          </p>
        ) : null}
      </div>
      <FormMessage state={state} />
      <button type="submit" className="h-btn h-btn--primary" disabled={pending}>
        {pending ? "Sending…" : "Submit review"}
      </button>
    </form>
  )
}
