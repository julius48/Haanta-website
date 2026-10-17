"use server"

import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { z } from "zod"
import { nextStep } from "../auth-flow"
import type { Me } from "../types"
import { ApiError, vendorApi } from "../server/api"
import { fieldErrorsOf, str, type FormState } from "../server/forms"
import { errorMessage } from "../server/session"

export type MfaSetupState = FormState & {
  setup?: { qr: string; secret: string; recovery_codes: string[] }
}

function signedOut(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401
}

/** Start enrolment. The secret and recovery codes live only in this response (shown once). */
export async function startMfaSetupAction(_prev: MfaSetupState): Promise<MfaSetupState> {
  let result: { secret: string; otpauth_uri: string; recovery_codes: string[] }
  try {
    result = await vendorApi("/vendor/mfa/setup", { method: "POST" })
  } catch (e) {
    if (signedOut(e)) redirect("/login?expired=1")
    if (e instanceof ApiError && e.status === 400 && /already/i.test(e.body?.message ?? "")) redirect("/mfa/verify")
    return { error: errorMessage(e, "We couldn't start two-factor setup. Please try again.") }
  }
  const qr = await QRCode.toDataURL(result.otpauth_uri, { errorCorrectionLevel: "M", margin: 2, width: 240 })
  return { setup: { qr, secret: result.secret, recovery_codes: result.recovery_codes } }
}

const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app")

async function goNext(): Promise<never> {
  let target = "/dashboard"
  try {
    target = nextStep(await vendorApi<Me>("/vendor/me"))
  } catch {
    target = "/login?expired=1"
  }
  redirect(target)
}

export async function confirmMfaAction(prev: MfaSetupState, fd: FormData): Promise<MfaSetupState> {
  const parsed = z
    .object({ code, saved: z.literal("yes", { error: "Confirm that you've saved your recovery codes" }) })
    .safeParse({ code: str(fd, "code").replace(/\s/g, ""), saved: str(fd, "saved") })
  if (!parsed.success) return { ...prev, error: undefined, fieldErrors: fieldErrorsOf(parsed.error) }
  try {
    await vendorApi("/vendor/mfa/confirm", { method: "POST", body: { code: parsed.data.code } })
  } catch (e) {
    if (signedOut(e)) redirect("/login?expired=1")
    return { ...prev, fieldErrors: { code: e instanceof ApiError && e.status === 400 ? "That code didn't work. Check the time on your phone and try the newest code." : errorMessage(e) } }
  }
  return goNext()
}

export async function verifyMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const useRecovery = str(fd, "method") === "recovery"
  let body: { code: string } | { recovery_code: string }
  if (useRecovery) {
    const r = z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]{5}-[a-z0-9]{5}$/, "Recovery codes look like abcde-12345")
      .safeParse(str(fd, "recovery_code"))
    if (!r.success) return { fieldErrors: { recovery_code: r.error.issues[0]!.message } }
    body = { recovery_code: r.data }
  } else {
    const r = code.safeParse(str(fd, "code").replace(/\s/g, ""))
    if (!r.success) return { fieldErrors: { code: r.error.issues[0]!.message } }
    body = { code: r.data }
  }
  try {
    await vendorApi("/vendor/mfa/verify", { method: "POST", body })
  } catch (e) {
    if (signedOut(e)) redirect("/login?expired=1")
    if (e instanceof ApiError && e.status === 400) return { fieldErrors: useRecovery ? { recovery_code: "That recovery code didn't work" } : { code: "That code didn't work. Try the newest code." } }
    return { error: errorMessage(e) }
  }
  return goNext()
}

export async function verifyEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token")
  if (token.length < 20 || token.length > 200) return { error: "This verification link is incomplete. Use the newest link from your email." }
  try {
    await vendorApi("/vendor/verify-email", { method: "POST", body: { token } })
  } catch (e) {
    if (signedOut(e)) redirect(`/login?next=${encodeURIComponent(`/verify-email?token=${token}`)}`)
    if (e instanceof ApiError && e.body?.code === "mfa_required") redirect("/mfa/verify")
    return { error: e instanceof ApiError && e.status < 500 ? (e.body?.message ?? "This link has expired. Send a new one.") : errorMessage(e) }
  }
  redirect("/dashboard?verified=1")
}

export async function resendVerificationAction(): Promise<FormState> {
  try {
    await vendorApi("/vendor/resend-verification", { method: "POST" })
  } catch (e) {
    if (signedOut(e)) redirect("/login?expired=1")
    return { error: errorMessage(e) }
  }
  return { message: "We've sent a new verification link. Check your inbox (and spam folder)." }
}
