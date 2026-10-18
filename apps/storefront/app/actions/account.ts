"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import { z } from "zod"
import { ApiError, COOKIE, medusa, secureCookie } from "@/lib/server/medusa"
import { errorMessage } from "@/lib/server/errors"
import { SESSION_MAX_AGE, getCartId } from "@/lib/server/cart"
import type { ActionState } from "@/lib/types"

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254)
const password = z.string().min(1, "Enter your password").max(128)
const newPassword = z.string().min(12, "Use at least 12 characters").max(128)
const name = (label: string) => z.string().trim().min(1, `Enter your ${label}`).max(80)

function turnstileToken(formData: FormData): string {
  const t = formData.get("cf-turnstile-response")
  if (typeof t === "string" && t) return t.slice(0, 2048)
  // Local/dev: no site key configured → the backend's mock verifier accepts any non-empty token.
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "" : "local-dev"
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "form")
    if (!out[k]) out[k] = issue.message
  }
  return out
}

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : ""
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/account"
}

async function startSession(token: string) {
  const jar = await cookies()
  jar.set(COOKIE.session, token, secureCookie(SESSION_MAX_AGE))
  // Attach the guest cart to the buyer (best effort).
  const cartId = await getCartId()
  if (cartId) {
    try {
      await medusa(`/store/carts/${cartId}/customer`, { method: "POST", headers: { authorization: `Bearer ${token}` } })
    } catch {
      // cart may belong to someone else or be completed
    }
  }
}

const LoginSchema = z.object({ email, password })

async function loginActionImpl(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }
  const token = turnstileToken(formData)
  if (!token) return { status: "error", message: "Please complete the security check." }
  try {
    const res = await medusa<{ token?: string; location?: string }>("/auth/customer/emailpass", {
      method: "POST",
      body: parsed.data,
      headers: { "x-turnstile-token": token },
    })
    if (!res.token) return { status: "error", message: "We couldn't sign you in. Please try again." }
    await startSession(res.token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { status: "error", message: "That email and password don't match. Try again or reset your password." }
    return { status: "error", message: errorMessage(e) }
  }
  redirect(safeNext(formData.get("next")))
}

const RegisterSchema = z.object({ first_name: name("first name"), last_name: name("last name"), email, password: newPassword })

async function registerActionImpl(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RegisterSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }
  const token = turnstileToken(formData)
  if (!token) return { status: "error", message: "Please complete the security check." }
  const { email: em, password: pw, first_name, last_name } = parsed.data
  try {
    const reg = await medusa<{ token: string }>("/auth/customer/emailpass/register", {
      method: "POST",
      body: { email: em, password: pw },
      headers: { "x-turnstile-token": token },
    })
    await medusa("/store/customers", { method: "POST", body: { email: em, first_name, last_name }, headers: { authorization: `Bearer ${reg.token}` } })
    const login = await medusa<{ token?: string }>("/auth/customer/emailpass", {
      method: "POST",
      body: { email: em, password: pw },
      headers: { "x-turnstile-token": token },
    })
    if (login.token) await startSession(login.token)
  } catch (e) {
    if (e instanceof ApiError && e.body?.code === "weak_password") {
      return { status: "error", message: e.body.message ?? "Choose a stronger password.", fieldErrors: { password: e.body.message ?? "Choose a stronger password" } }
    }
    if (e instanceof ApiError && e.body?.code === "turnstile_failed") return { status: "error", message: "Please complete the security check and try again." }
    if (e instanceof ApiError && (e.status === 401 || /exist/i.test(e.body?.message ?? ""))) {
      return { status: "error", message: "An account with this email may already exist. Try signing in or resetting your password." }
    }
    return { status: "error", message: errorMessage(e) }
  }
  redirect("/account")
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE.session)
  redirect("/")
}

async function forgotPasswordActionImpl(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = email.safeParse(formData.get("email"))
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address" } }
  const token = turnstileToken(formData)
  if (!token) return { status: "error", message: "Please complete the security check." }
  try {
    await medusa("/auth/customer/emailpass/reset-password", { method: "POST", body: { identifier: parsed.data }, headers: { "x-turnstile-token": token } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) return { status: "error", message: errorMessage(e) }
    // Same answer either way: never reveal whether an account exists.
  }
  return { status: "ok", message: "If an account exists for that email, we've sent a link to reset your password." }
}

const ResetSchema = z.object({ token: z.string().min(20).max(4096), email, password: newPassword })

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ResetSchema.safeParse({ token: formData.get("token"), email: formData.get("email"), password: formData.get("password") })
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }
  try {
    await medusa("/auth/customer/emailpass/update", {
      method: "POST",
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: { authorization: `Bearer ${parsed.data.token}` },
    })
  } catch (e) {
    if (e instanceof ApiError && e.body?.code === "weak_password") return { status: "error", message: e.body.message ?? "Choose a stronger password.", fieldErrors: { password: e.body.message ?? "" } }
    if (e instanceof ApiError && e.status === 401) return { status: "error", message: "This reset link has expired or was already used. Request a new one." }
    return { status: "error", message: errorMessage(e) }
  }
  return { status: "ok", message: "Your password has been updated. You can now sign in." }
}

const AddressSchema = z.object({
  first_name: name("first name"),
  last_name: name("last name"),
  address_1: z.string().trim().min(3, "Enter your street address").max(120),
  address_2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, "Enter your city").max(80),
  province: z.string().trim().min(2, "Enter your state or province").max(40),
  postal_code: z.string().trim().min(3, "Enter your postal code").max(12).regex(/^[A-Za-z0-9 -]+$/, "Enter a valid postal code"),
  country_code: z.enum(["us", "ca", "mx"]),
  phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Enter a valid phone number").optional(),
})

export async function addAddressAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(["first_name", "last_name", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone"].map((k) => [k, (formData.get(k) as string | null) || undefined]))
  const parsed = AddressSchema.safeParse(raw)
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }
  try {
    await medusa("/store/customers/me/addresses", { method: "POST", auth: true, body: { ...parsed.data, province: parsed.data.province.toUpperCase() } })
    refresh()
    return { status: "ok", message: "Address saved." }
  } catch (e) {
    return { status: "error", message: errorMessage(e) }
  }
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const id = z.string().regex(/^[A-Za-z0-9_]+$/).safeParse(formData.get("address_id"))
  if (!id.success) return
  try {
    await medusa(`/store/customers/me/addresses/${id.data}`, { method: "DELETE", auth: true })
  } catch {
    // ignore; the list re-renders with the current state
  }
  refresh()
}

const ReviewSchema = z.object({
  product_id: z.string().regex(/^prod_[A-Za-z0-9]+$/),
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(3000),
  fit: z.enum(["runs_small", "true_to_size", "runs_large"]).optional(),
})

export async function submitReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ReviewSchema.safeParse({
    product_id: formData.get("product_id"),
    rating: formData.get("rating") ?? 0,
    title: (formData.get("title") as string | null) || undefined,
    body: formData.get("body"),
    fit: (formData.get("fit") as string | null) || undefined,
  })
  if (!parsed.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) }
  const { product_id, ...body } = parsed.data
  try {
    await medusa(`/store/haanta/products/${product_id}/reviews`, { method: "POST", auth: true, body: { ...body, photos: [] } })
    return { status: "ok", message: "Thank you! Your review will appear once it has been checked." }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { status: "error", message: "Please sign in again to leave a review." }
    return { status: "error", message: errorMessage(e) }
  }
}

/** Echo non-secret fields back on error: React resets the form after an action, which would wipe them. */
function keepValues(names: string[], action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  return async (prev: ActionState, formData: FormData): Promise<ActionState> => {
    const res = await action(prev, formData)
    if (res.status !== "error") return res
    const values: Record<string, string> = {}
    for (const n of names) {
      const v = formData.get(n)
      if (typeof v === "string") values[n] = v.slice(0, 200)
    }
    return { ...res, values }
  }
}

export const loginAction = keepValues(["email"], loginActionImpl)
export const registerAction = keepValues(["first_name", "last_name", "email"], registerActionImpl)
export const forgotPasswordAction = keepValues(["email"], forgotPasswordActionImpl)
