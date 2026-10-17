/**
 * Hardening around Medusa's built-in /auth routes:
 * - Cloudflare Turnstile on buyer and vendor sign-up, login and password reset
 *   (token in the `x-turnstile-token` header so Medusa's body schema is unchanged)
 * - Password policy (12+ chars, not breached) on register and password update
 * - Per-IP rate limits and per-account temporary lockout on login
 * - Session id rotation when a session is created (prevents fixation)
 * - Alert on spikes of failed logins
 */
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createLockout, PASSWORD_PROBLEM_MESSAGES, validatePassword, maskEmail } from "@haanta/core"
import { getBreachedPasswordChecker, getTurnstileVerifier } from "../../lib/adapters"
import { getCounterStore } from "../../lib/counter-store"
import { clientIp } from "../../lib/http"
import { captureAlert } from "../../lib/monitoring"

/** Actor types that sign up/in from our Next apps (which render Turnstile). Admin users use MFA + lockout. */
const TURNSTILE_ACTORS = new Set(["customer", "vendor"])
const FAILED_LOGIN_ALERT = { windowMs: 5 * 60_000, threshold: 50 }

function actorFromPath(req: MedusaRequest): string {
  return String((req.params as Record<string, string>)?.actor_type ?? req.path.split("/")[2] ?? "")
}

export async function requireTurnstile(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (!TURNSTILE_ACTORS.has(actorFromPath(req))) return next()
  const token = req.headers["x-turnstile-token"]
  const ok = await getTurnstileVerifier().verify(typeof token === "string" ? token : undefined, clientIp(req))
  if (!ok) {
    res.status(400).json({ type: "invalid_data", code: "turnstile_failed", message: "Please complete the security check and try again." })
    return
  }
  next()
}

export async function enforcePasswordPolicy(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const body = (req.body ?? {}) as { password?: unknown; email?: unknown }
  if (typeof body.password !== "string") return next()
  const problems = await validatePassword(body.password, typeof body.email === "string" ? body.email : undefined, getBreachedPasswordChecker())
  if (problems.length) {
    res.status(400).json({ type: "invalid_data", code: "weak_password", message: problems.map((p) => PASSWORD_PROBLEM_MESSAGES[p]).join(" "), problems })
    return
  }
  next()
}

const lockout = () => createLockout(getCounterStore())

export async function loginLockout(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const email = (req.body as { email?: unknown })?.email
  if (typeof email !== "string" || !email) return next()
  const account = `${actorFromPath(req)}:${email.toLowerCase()}`
  if (await lockout().isLocked(account)) {
    res.status(429).json({ type: "too_many_requests", code: "account_locked", message: "Too many failed sign-in attempts. Try again in 15 minutes or reset your password." })
    return
  }
  res.on("finish", () => {
    void (async () => {
      if (res.statusCode === 401) {
        const r = await lockout().recordFailure(account)
        const logger = req.scope.resolve("logger") as { warn: (m: string) => void }
        logger.warn(`[auth] failed login for ${maskEmail(email)} from ${clientIp(req)}${r.locked ? " (account locked)" : ""}`)
        const spike = await getCounterStore().incr("alert:failed-logins", FAILED_LOGIN_ALERT.windowMs)
        if (spike.count === FAILED_LOGIN_ALERT.threshold) {
          logger.warn(`[alert] failed-login spike: ${spike.count} failures in 5 minutes`)
          captureAlert("failed_login_spike", { count: spike.count })
        }
      } else if (res.statusCode < 300) {
        await lockout().recordSuccess(account)
      }
    })()
  })
  next()
}

/** Rotate the session id when a new authenticated session is created. */
export function rotateSession(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const session = req.session as { regenerate?: (cb: (err?: unknown) => void) => void } | undefined
  if (!session?.regenerate) return next()
  session.regenerate((err) => (err ? next(err) : next()))
}
