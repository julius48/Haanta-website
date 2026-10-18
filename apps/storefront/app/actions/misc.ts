"use server"

import { cookies } from "next/headers"
import { z } from "zod"
import { ApiError, medusa } from "@/lib/server/medusa"
import { errorMessage } from "@/lib/server/errors"
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent"
import type { ActionState, TrackingResult } from "@/lib/types"

const NewsletterSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), source: z.enum(["popup", "footer", "checkout"]) })

export async function subscribeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = NewsletterSchema.safeParse({ email: formData.get("email"), source: formData.get("source") ?? "footer" })
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address" } }
  try {
    await medusa("/store/haanta/newsletter", { method: "POST", body: parsed.data })
    return { status: "ok", message: "You're on the list. Welcome to Haanta." }
  } catch (e) {
    return { status: "error", message: errorMessage(e, "We couldn't sign you up right now. Please try again.") }
  }
}

const ConsentSchema = z.object({ analytics: z.boolean(), marketing: z.boolean() }).strict()

/** Consent is a preference, not a secret: readable by the analytics helper, SameSite=Lax, 6 months. */
export async function saveConsentAction(input: { analytics: boolean; marketing: boolean }): Promise<{ ok: boolean }> {
  const parsed = ConsentSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  ;(await cookies()).set(CONSENT_COOKIE, serializeConsent(parsed.data), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 182,
  })
  return { ok: true }
}

const TrackingSchema = z.object({
  order_number: z.string().trim().regex(/^#?\d{1,9}$/, "Enter the number from your confirmation email").transform((s) => Number(s.replace("#", ""))),
  email: z.string().trim().toLowerCase().email("Enter the email you ordered with").max(254),
})

export async function trackOrderAction(_prev: ActionState<TrackingResult>, formData: FormData): Promise<ActionState<TrackingResult>> {
  const parsed = TrackingSchema.safeParse({ order_number: formData.get("order_number"), email: formData.get("email") })
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fe }
  }
  try {
    const data = await medusa<TrackingResult>("/store/haanta/tracking", { method: "POST", body: parsed.data })
    return { status: "ok", data }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { status: "error", message: "We couldn't find an order with those details. Check the order number and email." }
    return { status: "error", message: errorMessage(e) }
  }
}
