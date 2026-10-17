/**
 * TOTP two-factor authentication for admin users and vendor users.
 * - A login is identified by its session id (admin dashboard cookie) or its bearer token (vendor
 *   portal server). Only a SHA-256 hash of that key is stored.
 * - Until the login passes TOTP, every admin/vendor API except the MFA routes returns 403 mfa_required.
 */
import { createHash } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@haanta/core"
import { SECURITY_MODULE, type SecurityService } from "../modules/security"
import { bearerToken } from "./http"

export type MfaActorType = "user" | "vendor"

const SESSION_TTL_MS: Record<MfaActorType, number> = {
  user: 4 * 60 * 60 * 1000,
  vendor: 12 * 60 * 60 * 1000,
}

function encryptionKey(): string {
  const key = process.env.MFA_ENCRYPTION_KEY
  if (!key) throw new Error("MFA_ENCRYPTION_KEY is not set")
  return key
}

function pepper(): string {
  return process.env.MFA_RECOVERY_PEPPER || "dev-pepper"
}

/** Hash of the credential that identifies this login (session id or bearer token). */
export function loginKeyHash(req: MedusaRequest): string | null {
  const token = bearerToken(req)
  const raw = token ? `bearer:${token}` : req.session && (req as { sessionID?: string }).sessionID ? `session:${(req as { sessionID?: string }).sessionID}` : null
  return raw ? createHash("sha256").update(raw).digest("hex") : null
}

export function securityService(req: MedusaRequest) {
  return req.scope.resolve<SecurityService>(SECURITY_MODULE)
}

export async function mfaStatus(req: MedusaRequest, actorType: MfaActorType, actorId: string) {
  const security = securityService(req)
  const [factor] = await security.listMfaFactors({ actor_type: actorType, actor_id: actorId })
  const verified = await isLoginVerified(req, actorType, actorId)
  return { enrolled: !!factor?.confirmed_at, verified }
}

export async function isLoginVerified(req: MedusaRequest, actorType: MfaActorType, actorId: string): Promise<boolean> {
  const key = loginKeyHash(req)
  if (!key) return false
  const [row] = await securityService(req).listMfaSessions({ key_hash: key, actor_type: actorType, actor_id: actorId })
  return !!row && new Date(row.expires_at).getTime() > Date.now()
}

async function markLoginVerified(req: MedusaRequest, actorType: MfaActorType, actorId: string) {
  const key = loginKeyHash(req)
  if (!key) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "No active login")
  const security = securityService(req)
  const [existing] = await security.listMfaSessions({ key_hash: key })
  const expires_at = new Date(Date.now() + SESSION_TTL_MS[actorType])
  if (existing) await security.updateMfaSessions({ id: existing.id, actor_type: actorType, actor_id: actorId, expires_at })
  else await security.createMfaSessions({ key_hash: key, actor_type: actorType, actor_id: actorId, expires_at })
}

/** Start enrolment. Allowed only while no confirmed factor exists (reset is an admin action). */
export async function beginEnrolment(req: MedusaRequest, actorType: MfaActorType, actorId: string, accountLabel: string) {
  const security = securityService(req)
  const [factor] = await security.listMfaFactors({ actor_type: actorType, actor_id: actorId })
  if (factor?.confirmed_at) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Two-factor authentication is already set up")
  const secret = generateTotpSecret()
  const recoveryCodes = generateRecoveryCodes()
  const data = {
    secret_enc: encryptSecret(secret, encryptionKey()),
    recovery_hashes: recoveryCodes.map((c) => hashRecoveryCode(c, pepper())),
    confirmed_at: null,
    last_used_counter: null,
  }
  if (factor) await security.updateMfaFactors({ id: factor.id, ...data })
  else await security.createMfaFactors({ actor_type: actorType, actor_id: actorId, ...data })
  return { secret, otpauth_uri: otpauthUri(secret, accountLabel), recovery_codes: recoveryCodes }
}

/** Confirm enrolment with a first code; this also verifies the current login. */
export async function confirmEnrolment(req: MedusaRequest, actorType: MfaActorType, actorId: string, code: string) {
  const security = securityService(req)
  const [factor] = await security.listMfaFactors({ actor_type: actorType, actor_id: actorId })
  if (!factor) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Start two-factor setup first")
  if (factor.confirmed_at) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Two-factor authentication is already set up")
  const counter = verifyTotp(decryptSecret(factor.secret_enc, encryptionKey()), code)
  if (counter === null) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid code")
  await security.updateMfaFactors({ id: factor.id, confirmed_at: new Date(), last_used_counter: counter })
  await markLoginVerified(req, actorType, actorId)
}

/** Verify the current login with a TOTP code or a single-use recovery code. */
export async function verifyLogin(req: MedusaRequest, actorType: MfaActorType, actorId: string, input: { code?: string; recovery_code?: string }) {
  const security = securityService(req)
  const [factor] = await security.listMfaFactors({ actor_type: actorType, actor_id: actorId })
  if (!factor?.confirmed_at) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Set up two-factor authentication first")
  if (input.code) {
    const counter = verifyTotp(decryptSecret(factor.secret_enc, encryptionKey()), input.code, { lastUsedCounter: factor.last_used_counter })
    if (counter === null) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid code")
    await security.updateMfaFactors({ id: factor.id, last_used_counter: counter })
  } else if (input.recovery_code) {
    const hash = hashRecoveryCode(input.recovery_code, pepper())
    const hashes = (factor.recovery_hashes as string[]) ?? []
    if (!hashes.includes(hash)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid recovery code")
    await security.updateMfaFactors({ id: factor.id, recovery_hashes: hashes.filter((h) => h !== hash) })
  } else {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a code")
  }
  await markLoginVerified(req, actorType, actorId)
}

/** Admin action: remove a user's or vendor's factor so they re-enrol at next login. */
export async function resetFactor(req: MedusaRequest, actorType: MfaActorType, actorId: string) {
  const security = securityService(req)
  const factors = await security.listMfaFactors({ actor_type: actorType, actor_id: actorId })
  if (factors.length) await security.deleteMfaFactors(factors.map((f) => f.id))
  const sessions = await security.listMfaSessions({ actor_type: actorType, actor_id: actorId })
  if (sessions.length) await security.deleteMfaSessions(sessions.map((s) => s.id))
}
