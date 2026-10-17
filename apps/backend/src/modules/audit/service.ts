import { MedusaService } from "@medusajs/framework/utils"
import { AuditLog } from "./models"
import { redact } from "@haanta/core"



export interface AuditInput {
  actor_type: "user" | "vendor" | "customer" | "system"
  actor_id: string
  action: string
  entity_type: string
  entity_id?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
}

class AuditBase extends MedusaService({ AuditLog }) {}

export class AuditService extends AuditBase {
  /** The only write path. Secrets are redacted before storage. Updates and deletes are blocked in the DB. */
  async record(input: AuditInput) {
    return this.createAuditLogs({
      actor_type: input.actor_type,
      actor_id: input.actor_id,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      before: input.before == null ? null : (redact(input.before) as Record<string, unknown>),
      after: input.after == null ? null : (redact(input.after) as Record<string, unknown>),
      ip: input.ip ?? null,
    })
  }
}

// Prevent accidental use of generated mutators on an append-only table.
for (const m of ["updateAuditLogs", "deleteAuditLogs", "softDeleteAuditLogs", "restoreAuditLogs"] as const) {
  Object.defineProperty(AuditService.prototype, m, {
    value: () => {
      throw new Error("audit_log is append-only")
    },
  })
}
