import type { InputHTMLAttributes } from "react"

/** Labelled input with hint and error wired up via aria-describedby. */
export function Field({
  id,
  label,
  hint,
  error,
  className = "",
  children,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: React.ReactNode; hint?: React.ReactNode; error?: string; children?: React.ReactNode }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
  return (
    <div className={`s-field ${error ? "s-field--error" : ""} ${className}`.trim()}>
      <label htmlFor={id} className="s-label">
        {label}
        {input.required ? <span className="s-required"> (required)</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="s-hint">
          {hint}
        </p>
      ) : null}
      <input id={id} className="s-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {children}
      {error ? (
        <p id={`${id}-error`} className="s-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function FormMessage({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "idle" || !state.message) return <div role="status" aria-live="polite" className="s-form-msg-empty" />
  return (
    <div role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={`s-notice s-notice--${state.status === "error" ? "error" : "ok"}`}>
      {state.message}
    </div>
  )
}
