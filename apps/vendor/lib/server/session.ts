import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FORBIDDEN_REDIRECTS, nextStep } from "../auth-flow"
import type { ActionResult } from "../form-state"
import type { Me } from "../types"

export type { ActionResult }
import { ApiError, SESSION_COOKIE, sessionCookieOptions, vendorApi } from "./api"

export async function hasSession(): Promise<boolean> {
  return !!(await cookies()).get(SESSION_COOKIE)?.value
}

/** Store the vendor token in the HttpOnly cookie (Server Actions / route handlers only). */
export async function setSession(token: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions())
}

export async function clearSession() {
  ;(await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
}

/** The signed-in vendor, once per request. null when signed out or the token is no longer valid. */
export const getMe = cache(async (): Promise<Me | null> => {
  if (!(await hasSession())) return null
  try {
    return await vendorApi<Me>("/vendor/me")
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
    throw e
  }
})

/** For portal pages: signed in, MFA verified and email verified, or redirect to the right screen. */
export async function requireVendor(): Promise<Me> {
  const me = await getMe()
  if (!me) redirect("/login?expired=1")
  const step = nextStep(me)
  if (step !== "/dashboard") redirect(step)
  return me
}

/** Redirect target for an API error that the user must resolve on another screen, else null. */
export function redirectFor(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null
  if (e.status === 401) return "/login?expired=1"
  if (e.status === 403 && e.body?.code) return FORBIDDEN_REDIRECTS[e.body.code] ?? null
  return null
}

/** GET for server components: auth problems redirect, other errors propagate to error.tsx. */
export async function vendorGet<T>(path: string): Promise<T> {
  let target: string | null = null
  try {
    return await vendorApi<T>(path)
  } catch (e) {
    target = redirectFor(e)
    if (!target) throw e
  }
  redirect(target)
}

/** Like vendorGet but returns null on 404 (for detail pages). */
export async function vendorGetOrNull<T>(path: string): Promise<T | null> {
  let target: string | null = null
  try {
    return await vendorApi<T>(path)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    target = redirectFor(e)
    if (!target) throw e
  }
  redirect(target)
}


export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return e.body?.message ?? "Too many attempts. Please wait a moment and try again."
    if (e.status >= 500) return fallback
    return e.body?.message ?? fallback
  }
  return fallback
}

/**
 * Run a backend mutation from a Server Action. Auth errors redirect (outside the try, so the
 * redirect is not swallowed); other API errors become a message for the form.
 */
export async function mutate<T>(path: string, opts: Parameters<typeof vendorApi>[1]): Promise<ActionResult<T>> {
  let target: string | null = null
  try {
    return { ok: true, data: await vendorApi<T>(path, opts) }
  } catch (e) {
    target = redirectFor(e)
    if (!target) return { ok: false, error: errorMessage(e), problems: e instanceof ApiError ? e.body?.problems : undefined }
  }
  redirect(target)
}
