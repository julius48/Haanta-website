import type { AuthContext, MedusaRequest } from "@medusajs/framework/http"
import { AUDIT_MODULE, type AuditInput, type AuditService } from "../modules/audit"

export type AnyRequest = MedusaRequest & { auth_context?: AuthContext; vendorContext?: VendorContext; staffRole?: string }

export interface VendorContext {
  vendor_id: string
  vendor_user_id: string
  vendor_status: "pending" | "active" | "paused" | "rejected"
  email_verified: boolean
}

/** Client IP. Express trusts the proxy hop configured by the host (see docs/runbook.md). */
export function clientIp(req: MedusaRequest): string {
  return (req.ip || req.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "")
}

export function actorOf(req: AnyRequest): { type: AuditInput["actor_type"]; id: string } {
  const ctx = req.auth_context
  if (!ctx?.actor_id) return { type: "system", id: "anonymous" }
  const type = ctx.actor_type === "user" ? "user" : ctx.actor_type === "vendor" ? "vendor" : ctx.actor_type === "customer" ? "customer" : "system"
  return { type, id: ctx.actor_id }
}

/** Record an explicit audit entry with before/after for the current actor. */
export async function audit(
  req: AnyRequest,
  input: Omit<AuditInput, "actor_type" | "actor_id" | "ip"> & Partial<Pick<AuditInput, "actor_type" | "actor_id">>,
) {
  const actor = actorOf(req)
  const service = req.scope.resolve<AuditService>(AUDIT_MODULE)
  await service.record({ actor_type: input.actor_type ?? actor.type, actor_id: input.actor_id ?? actor.id, ip: clientIp(req), ...input })
}

/**
 * Full request path without the query string. Use this (never req.path) for security decisions:
 * Medusa mounts middlewares at their matcher, so req.path is relative to the mount point.
 */
export function fullPath(req: MedusaRequest): string {
  return (req.originalUrl || req.url || "").split("?")[0]!.replace(/\/+$/, "") || "/"
}

export function bearerToken(req: MedusaRequest): string | null {
  const h = req.headers.authorization
  if (!h || !/^Bearer\s+/i.test(h)) return null
  return h.replace(/^Bearer\s+/i, "").trim() || null
}
