import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IUserModuleService } from "@medusajs/framework/types"
import { SECURITY_MODULE, type SecurityService, type StaffRole } from "../../../../modules/security"
import { audit, type AnyRequest } from "../../../../lib/http"

/** Staff and their Haanta roles (admin only). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const users = await req.scope.resolve<IUserModuleService>(Modules.USER).listUsers({}, { take: 500 })
  const roles = await req.scope.resolve<SecurityService>(SECURITY_MODULE).listStaffRoles({}, { take: 500 })
  res.json({ staff: users.map((u) => ({ id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, role: roles.find((r) => r.user_id === u.id)?.role ?? null })) })
}

export async function POST(req: AuthenticatedMedusaRequest<{ user_id: string; role: StaffRole }>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const { user_id, role } = req.validatedBody
  if (user_id === r.auth_context!.actor_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "You can't change your own role")
  await req.scope.resolve<IUserModuleService>(Modules.USER).retrieveUser(user_id)
  const security = req.scope.resolve<SecurityService>(SECURITY_MODULE)
  const [existing] = await security.listStaffRoles({ user_id })
  if (existing) await security.updateStaffRoles({ id: existing.id, role })
  else await security.createStaffRoles({ user_id, role })
  await audit(r, { action: "staff.role", entity_type: "user", entity_id: user_id, before: { role: existing?.role ?? null }, after: { role } })
  res.json({ user_id, role })
}
