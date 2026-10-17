/** Shared MFA route handlers for admin users and vendor users. */
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IUserModuleService } from "@medusajs/framework/types"
import { audit, type AnyRequest } from "./http"
import { beginEnrolment, confirmEnrolment, mfaStatus, verifyLogin, type MfaActorType } from "./mfa"
import { marketplaceOf } from "./vendor-onboarding"

async function accountLabel(req: AuthenticatedMedusaRequest, actorType: MfaActorType, actorId: string): Promise<string> {
  if (actorType === "user") {
    const user = await req.scope.resolve<IUserModuleService>(Modules.USER).retrieveUser(actorId)
    return user.email
  }
  const [u] = await marketplaceOf(req).listVendorUsers({ id: actorId })
  return u?.email ?? actorId
}

export function mfaHandlers(actorType: MfaActorType) {
  const actor = (req: AuthenticatedMedusaRequest) => (req as unknown as AnyRequest).auth_context!.actor_id
  return {
    status: async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
      res.json(await mfaStatus(req, actorType, actor(req)))
    },
    setup: async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
      const id = actor(req)
      const result = await beginEnrolment(req, actorType, id, await accountLabel(req, actorType, id))
      await audit(req as unknown as AnyRequest, { action: "mfa.enrolment_started", entity_type: `${actorType}`, entity_id: id })
      // The secret and recovery codes are shown once and never stored in plain text.
      res.json(result)
    },
    confirm: async (req: AuthenticatedMedusaRequest<{ code: string }>, res: MedusaResponse) => {
      const id = actor(req)
      await confirmEnrolment(req, actorType, id, req.validatedBody.code)
      await audit(req as unknown as AnyRequest, { action: "mfa.enrolled", entity_type: `${actorType}`, entity_id: id })
      res.json({ enrolled: true, verified: true })
    },
    verify: async (req: AuthenticatedMedusaRequest<{ code?: string; recovery_code?: string }>, res: MedusaResponse) => {
      const id = actor(req)
      await verifyLogin(req, actorType, id, req.validatedBody)
      if (req.validatedBody.recovery_code) {
        await audit(req as unknown as AnyRequest, { action: "mfa.recovery_code_used", entity_type: `${actorType}`, entity_id: id })
      }
      res.json({ verified: true })
    },
  }
}
