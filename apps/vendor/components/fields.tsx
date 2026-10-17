import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

/**
 * Accessible form fields: visible label, optional hint, and an error tied to the control with
 * aria-describedby + aria-invalid. No hooks, so they work in server and client components.
 */
interface FieldBase {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
}

export function describedBy(id: string, hint?: ReactNode, error?: string | null): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length ? ids.join(" ") : undefined
}

function Label({ id, label, optional }: { id: string; label: ReactNode; optional?: boolean }) {
  return (
    <label className="v-label" htmlFor={id}>
      {label}
      {optional ? <span className="v-optional"> (optional)</span> : null}
    </label>
  )
}

function HintAndError({ id, hint, error }: { id: string; hint?: ReactNode; error?: string | null }) {
  return (
    <>
      {hint ? (
        <span className="v-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="v-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </>
  )
}

export function TextField({ id, label, hint, error, optional, className, ...input }: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <div className={`v-field ${className ?? ""}`.trim()}>
      <Label id={id} label={label} optional={optional} />
      <input id={id} name={input.name ?? id} className="v-input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  )
}

export function TextArea({ id, label, hint, error, optional, className, ...input }: FieldBase & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <div className={`v-field ${className ?? ""}`.trim()}>
      <Label id={id} label={label} optional={optional} />
      <textarea id={id} name={input.name ?? id} className="v-textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  )
}

export function SelectField({ id, label, hint, error, optional, className, children, ...input }: FieldBase & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <div className={`v-field ${className ?? ""}`.trim()}>
      <Label id={id} label={label} optional={optional} />
      <select id={id} name={input.name ?? id} className="v-select" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input}>
        {children}
      </select>
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  )
}

export function Checkbox({ id, label, hint, error, className, ...input }: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  return (
    <div className={`v-field ${className ?? ""}`.trim()}>
      <label className="v-check" htmlFor={id}>
        <input id={id} name={input.name ?? id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
        <span>{label}</span>
      </label>
      <HintAndError id={id} hint={hint} error={error} />
    </div>
  )
}

export function Alert({ tone = "info", title, children, id, focus }: { tone?: "info" | "error" | "success" | "warning"; title?: string; children?: ReactNode; id?: string; focus?: boolean }) {
  const role = tone === "error" ? "alert" : "status"
  return (
    <div className={`v-alert v-alert--${tone}`} role={role} id={id} tabIndex={focus ? -1 : undefined}>
      {title ? <p className="v-alert__title">{title}</p> : null}
      {children}
    </div>
  )
}

export function FormErrors({ error, problems }: { error?: string | null; problems?: string[] | null }) {
  if (!error && !problems?.length) return null
  return (
    <Alert tone="error" title={error ?? "Please check the form"}>
      {problems?.length ? (
        <ul>
          {problems.map((p) => (
            <li key={p}>{PROBLEM_TEXT[p] ?? p}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  )
}

const PROBLEM_TEXT: Record<string, string> = {
  too_short: "Use at least 12 characters.",
  too_long: "Use a shorter password.",
  breached: "This password has appeared in a data breach. Choose a different one.",
  contains_email: "Don't include your email address in the password.",
  common: "This password is too common.",
}
