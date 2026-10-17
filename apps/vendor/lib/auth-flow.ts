/** Where a signed-in vendor user must go next (pure, shared by pages and actions). */
import type { Me } from "./types"

/** API 403 codes → the screen that resolves them. */
export const FORBIDDEN_REDIRECTS: Record<string, string> = {
  mfa_required: "/mfa/verify",
  email_unverified: "/verify-email",
  vendor_pending: "/dashboard?blocked=pending",
  vendor_paused: "/dashboard?blocked=paused",
  vendor_rejected: "/account?blocked=rejected",
}

/** Only same-site relative paths are accepted as a post-login destination. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null
  return next
}

export function nextStep(me: Pick<Me, "mfa" | "user">, next?: string | null): string {
  const target = safeNext(next)
  if (!me.mfa.enrolled) return "/mfa/setup"
  if (!me.mfa.verified) return "/mfa/verify"
  if (!me.user.email_verified) return target?.startsWith("/verify-email") ? target : "/verify-email"
  if (target && !target.startsWith("/login") && !target.startsWith("/mfa")) return target
  return "/dashboard"
}

export const PASSWORD_HELP = "At least 12 characters. Avoid passwords that have appeared in data breaches; a short phrase of several words works well."
