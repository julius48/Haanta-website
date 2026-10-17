import { model } from "@medusajs/framework/utils"

/** Append-only audit log of admin and vendor actions: who, what, when, before and after. */
export const AuditLog = model
  .define("audit_log", {
    id: model.id({ prefix: "aud" }).primaryKey(),
    actor_type: model.enum(["user", "vendor", "customer", "system"]),
    actor_id: model.text(),
    action: model.text(),
    entity_type: model.text(),
    entity_id: model.text().nullable(),
    before: model.json().nullable(),
    after: model.json().nullable(),
    ip: model.text().nullable(),
  })
  .indexes([{ on: ["entity_type", "entity_id"] }, { on: ["actor_id"] }, { on: ["action"] }])

