import "server-only"
import { ApiError } from "./medusa"

/** A safe, human message for an error from the backend (never leaks 5xx internals). */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  // Server log only (never sent to the browser): status and backend error type, no request bodies.
  if (e instanceof ApiError) console.warn(`[storefront] backend error ${e.status} ${e.body?.type ?? ""} ${e.body?.code ?? ""}: ${e.body?.message ?? ""}`)
  else console.warn("[storefront] request failed:", e instanceof Error ? e.message : e)
  if (e instanceof ApiError) {
    if (e.status === 429) return "Too many requests. Please wait a moment and try again."
    if (e.status >= 500) return fallback
    return e.body?.message ?? fallback
  }
  return fallback
}
