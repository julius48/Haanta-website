import { MedusaService } from "@medusajs/framework/utils"
import { MfaFactor, MfaSession, StaffRoleModel, WebhookEvent, type StaffRole } from "./models"

export { STAFF_ROLES, type StaffRole } from "./models"

export class SecurityService extends MedusaService({ StaffRole: StaffRoleModel, MfaFactor, MfaSession, WebhookEvent }) {
  async getRole(userId: string): Promise<StaffRole | null> {
    const [row] = await this.listStaffRoles({ user_id: userId })
    return (row?.role as StaffRole | undefined) ?? null
  }

  /**
   * Claim a webhook event. Returns false if it was already processed (or is being processed),
   * so duplicates are acknowledged without side effects.
   */
  async claimWebhookEvent(provider: string, eventId: string, type: string): Promise<boolean> {
    const [existing] = await this.listWebhookEvents({ provider, event_id: eventId })
    if (existing && existing.status !== "failed") return false
    if (existing) {
      await this.updateWebhookEvents({ id: existing.id, status: "processing", error: null })
      return true
    }
    try {
      await this.createWebhookEvents({ provider, event_id: eventId, type })
      return true
    } catch {
      // Unique violation: a concurrent delivery claimed it first.
      return false
    }
  }

  async completeWebhookEvent(provider: string, eventId: string, error?: string) {
    const [row] = await this.listWebhookEvents({ provider, event_id: eventId })
    if (row) await this.updateWebhookEvents({ id: row.id, status: error ? "failed" : "processed", error: error ?? null })
  }
}
