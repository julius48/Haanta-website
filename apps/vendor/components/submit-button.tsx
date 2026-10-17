"use client"

import type { ButtonHTMLAttributes } from "react"
import { useFormStatus } from "react-dom"

/** Submit button that shows progress while its form's Server Action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" {...props} className={`h-btn h-btn--${variant} ${className}`.trim()} disabled={pending || props.disabled} aria-disabled={pending || props.disabled}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  )
}
