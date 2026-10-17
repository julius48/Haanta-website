import "server-only"
import type { z } from "zod"

export type { FormState } from "../form-state"

/** First zod issue per field. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    if (!out[key]) out[key] = issue.message
  }
  return out
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** Turnstile token from the widget, or `local-dev` when Turnstile isn't configured. */
export function turnstileToken(fd: FormData): string {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return "local-dev"
  return str(fd, "cf-turnstile-response")
}

export const RESOURCE_ID = /^[A-Za-z0-9_-]{3,64}$/
