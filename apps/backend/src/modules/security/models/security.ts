import { model } from "@medusajs/framework/utils"

export const STAFF_ROLES = ["admin", "catalog_reviewer", "finance", "support"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Haanta admin sub-role per Medusa user. Users without a row have no admin access. */
export const StaffRoleModel = model.define("staff_role", {
  id: model.id({ prefix: "srole" }).primaryKey(),
  user_id: model.text().unique(),
  role: model.enum([...STAFF_ROLES]),
})

/** TOTP factor per actor. The secret is AES-256-GCM encrypted with MFA_ENCRYPTION_KEY. */
export const MfaFactor = model
  .define("mfa_factor", {
    id: model.id({ prefix: "mfa" }).primaryKey(),
    actor_type: model.enum(["user", "vendor"]),
    actor_id: model.text(),
    secret_enc: model.text(),
    confirmed_at: model.dateTime().nullable(),
    last_used_counter: model.number().nullable(),
    recovery_hashes: model.json(),
  })
  .indexes([{ on: ["actor_type", "actor_id"], unique: true }])

/** A login (session id or bearer token, stored hashed) that has passed the second factor. */
export const MfaSession = model.define("mfa_session", {
  id: model.id({ prefix: "mfas" }).primaryKey(),
  key_hash: model.text().unique(),
  actor_type: model.enum(["user", "vendor"]),
  actor_id: model.text(),
  expires_at: model.dateTime(),
})

/** Webhook idempotency: one row per provider event id. */
export const WebhookEvent = model
  .define("webhook_event", {
    id: model.id({ prefix: "whe" }).primaryKey(),
    provider: model.text(),
    event_id: model.text(),
    type: model.text(),
    status: model.enum(["processing", "processed", "failed"]).default("processing"),
    error: model.text().nullable(),
  })
  .indexes([{ on: ["provider", "event_id"], unique: true }])
