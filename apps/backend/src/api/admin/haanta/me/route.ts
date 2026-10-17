import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../../lib/http"
import { mfaStatus } from "../../../../lib/mfa"

/** Current staff member's Haanta role and MFA state (used by the dashboard shell). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  res.json({ user_id: r.auth_context!.actor_id, role: r.staffRole, mfa: await mfaStatus(req, "user", r.auth_context!.actor_id) })
}
