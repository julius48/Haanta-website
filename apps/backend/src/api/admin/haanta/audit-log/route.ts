import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AUDIT_MODULE, type AuditService } from "../../../../modules/audit"

/** Audit log viewer (admin only): who, what, when, before and after. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = req.validatedQuery as { limit: number; offset: number; entity_type?: string; entity_id?: string; actor_id?: string; action?: string }
  const filter: Record<string, string> = {}
  for (const k of ["entity_type", "entity_id", "actor_id", "action"] as const) if (q[k]) filter[k] = q[k]!
  const [rows, count] = await req.scope.resolve<AuditService>(AUDIT_MODULE).listAndCountAuditLogs(filter, { take: q.limit, skip: q.offset, order: { created_at: "DESC" } })
  res.json({ entries: rows, count, limit: q.limit, offset: q.offset })
}
