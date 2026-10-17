"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { nextStep, safeNext } from "../auth-flow"
import type { Me } from "../types"
import { ApiError, vendorApi } from "../server/api"
import { fieldErrorsOf, str, turnstileToken, type FormState } from "../server/forms"
import { clearSession, setSession } from "../server/session"

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254)
const password = z.string().min(1, "Enter your password").max(200)
const newPassword = z.string().min(12, "Use at least 12 characters").max(200)

function authError(e: unknown, fallback: string): FormState {
  if (e instanceof ApiError) {
    const code = e.body?.code
    if (code === "weak_password") return { error: "Choose a stronger password.", fieldErrors: { password: e.body?.message ?? "Choose a stronger password" }, problems: e.body?.problems }
    if (code === "turnstile_failed") return { error: "Please complete the security check and try again." }
    if (e.status === 429) return { error: e.body?.message ?? "Too many attempts. Please wait and try again." }
    if (e.status === 400 && e.body?.message) return { error: e.body.message }
  }
  return { error: fallback }
}

async function signIn(emailValue: string, passwordValue: string, turnstile: string): Promise<string> {
  const { token } = await vendorApi<{ token?: string }>("/auth/vendor/emailpass", {
    method: "POST",
    token: null,
    body: { email: emailValue, password: passwordValue },
    headers: { "x-turnstile-token": turnstile },
  })
  if (!token) throw new ApiError(401, { message: "Sign-in failed" })
  return token
}

async function register(emailValue: string, passwordValue: string, turnstile: string): Promise<string> {
  const { token } = await vendorApi<{ token?: string }>("/auth/vendor/emailpass/register", {
    method: "POST",
    token: null,
    body: { email: emailValue, password: passwordValue },
    headers: { "x-turnstile-token": turnstile },
  })
  if (!token) throw new ApiError(400, { message: "Registration failed" })
  return token
}

/** Sign in, keep the token in the HttpOnly cookie, then route by MFA / email / status. */
export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ email, password }).safeParse({ email: str(fd, "email"), password: str(fd, "password") })
  const values = { email: str(fd, "email") }
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }
  let me: Me
  try {
    const token = await signIn(parsed.data.email, parsed.data.password, turnstileToken(fd))
    try {
      me = await vendorApi<Me>("/vendor/me", { token })
    } catch {
      return { error: "This account isn't linked to a Haanta partner store. Finish your application or contact Haanta.", values }
    }
    await setSession(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { error: "Email or password is incorrect.", values }
    return { ...authError(e, "We couldn't sign you in. Please try again."), values }
  }
  redirect(nextStep(me, safeNext(str(fd, "next"))))
}

const applicationSchema = z.object({
  email,
  password: newPassword,
  business_name: z.string().trim().min(2, "Enter your business name").max(120),
  contact_name: z.string().trim().min(2, "Enter your name").max(120),
  origin_country: z.string().trim().length(2, "Choose a country").toUpperCase(),
  region: z.string().trim().max(120).optional(),
  story: z.string().trim().max(5000).optional(),
  website: z.union([z.literal(""), z.string().trim().url("Enter a full web address, starting with https://").max(300)]).optional(),
  instagram: z.string().trim().max(60).optional(),
})

/** Register → application (with the registration token) → sign in → MFA setup. */
export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["email", "password", "business_name", "contact_name", "origin_country", "region", "story", "website", "instagram"].map((k) => [k, str(fd, k)]))
  const { password: _pw, ...values } = raw
  const parsed = applicationSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }
  const d = parsed.data
  const turnstile = turnstileToken(fd)
  try {
    const registrationToken = await register(d.email, d.password, turnstile)
    await vendorApi("/vendor/applications", {
      method: "POST",
      token: registrationToken,
      body: {
        business_name: d.business_name,
        contact_name: d.contact_name,
        origin_country: d.origin_country,
        ...(d.region ? { region: d.region } : {}),
        ...(d.story ? { story: d.story } : {}),
        ...(d.website ? { website: d.website } : {}),
        ...(d.instagram ? { instagram: d.instagram } : {}),
      },
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { error: "An account with this email already exists. Sign in instead.", values }
    return { ...authError(e, "We couldn't create your account. Please try again."), values }
  }
  return finishWithSignIn(d.email, d.password, turnstile)
}

async function finishWithSignIn(emailValue: string, passwordValue: string, turnstile: string): Promise<FormState> {
  let ok = false
  try {
    await setSession(await signIn(emailValue, passwordValue, turnstile))
    ok = true
  } catch {
    // A real Turnstile token is single-use: ask the vendor to sign in once more.
  }
  redirect(ok ? "/mfa/setup" : "/login?registered=1")
}

const inviteSchema = z.object({ token: z.string().min(20, "This invite link is incomplete").max(200), name: z.string().trim().min(2, "Enter your name").max(120), email, password: newPassword })

/** Accept an invite: register → POST /vendor/invites/accept → sign in. */
export async function acceptInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = { token: str(fd, "token"), name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") }
  const values = { name: raw.name, email: raw.email }
  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }
  const d = parsed.data
  const turnstile = turnstileToken(fd)
  try {
    const registrationToken = await register(d.email, d.password, turnstile)
    await vendorApi("/vendor/invites/accept", { method: "POST", token: registrationToken, body: { token: d.token, name: d.name } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { error: "An account with this email already exists. Sign in instead, or ask Haanta for a new invite.", values }
    if (e instanceof ApiError && e.status === 404) return { error: "This invite is no longer valid. Ask Haanta for a new one.", values }
    return { ...authError(e, "We couldn't accept the invite. Please try again."), values }
  }
  return finishWithSignIn(d.email, d.password, turnstile)
}

export async function requestResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ email }).safeParse({ email: str(fd, "email") })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: { email: str(fd, "email") } }
  try {
    await vendorApi("/auth/vendor/emailpass/reset-password", {
      method: "POST",
      token: null,
      body: { identifier: parsed.data.email },
      headers: { "x-turnstile-token": turnstileToken(fd) },
    })
  } catch (e) {
    const err = authError(e, "")
    if (err.error) return err
  }
  // Same answer whether or not the account exists.
  return { message: "If an account exists for that email, we've sent a link to reset your password. The link expires soon, so use it right away." }
}

const updateSchema = z
  .object({ token: z.string().min(20, "This reset link is incomplete").max(4000), email, password: newPassword, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" })

export async function updatePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = { token: str(fd, "token"), email: str(fd, "email"), password: str(fd, "password"), confirm: str(fd, "confirm") }
  const values = { email: raw.email }
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }
  try {
    // The reset token authorises this one request (Medusa reads it from the Authorization header).
    await vendorApi("/auth/vendor/emailpass/update", { method: "POST", token: parsed.data.token, body: { email: parsed.data.email, password: parsed.data.password } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { error: "This reset link has expired or was already used. Request a new one.", values }
    return { ...authError(e, "We couldn't update your password. Please try again."), values }
  }
  redirect("/login?reset=1")
}

export async function logoutAction(): Promise<void> {
  await clearSession()
  redirect("/login?signed_out=1")
}
