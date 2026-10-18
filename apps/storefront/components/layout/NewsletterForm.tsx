"use client"

import { useActionState, useEffect, useId } from "react"
import { subscribeAction } from "@/app/actions/misc"
import { POPUP_SUBSCRIBED_KEY } from "@/lib/popup"
import type { ActionState } from "@/lib/types"

export function NewsletterForm({
  source,
  onSuccess,
  tone = "light",
}: {
  source: "footer" | "popup" | "checkout"
  onSuccess?: () => void
  tone?: "light" | "dark"
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(subscribeAction, {
    status: "idle",
  })
  const id = useId()
  useEffect(() => {
    if (state.status === "ok") {
      try {
        localStorage.setItem(POPUP_SUBSCRIBED_KEY, "1")
      } catch {
        // storage unavailable
      }
      onSuccess?.()
    }
  }, [state.status, onSuccess])
  const err = state.status === "error" ? state.message : null
  return (
    <form
      action={action}
      className={`s-newsletter s-newsletter--${tone}`}
      noValidate
      data-testid={`newsletter-${source}`}
    >
      <input type="hidden" name="source" value={source} />
      <label htmlFor={`${id}-email`} className="s-label">
        Email address
      </label>
      <div className="s-newsletter__row">
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          className="s-input"
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-msg`}
        />
        <button type="submit" className="h-btn h-btn--primary" disabled={pending}>
          {pending ? "Signing up…" : "Sign up"}
        </button>
      </div>
      <p
        id={`${id}-msg`}
        role="status"
        aria-live="polite"
        className={err ? "s-error" : "s-success"}
      >
        {state.status === "ok" ? state.message : err}
      </p>
    </form>
  )
}
