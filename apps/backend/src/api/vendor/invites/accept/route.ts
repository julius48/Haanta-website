import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import { sanitizePlainText } from "@haanta/core"
import { audit, type AnyRequest } from "../../../../lib/http"
import { consumeToken } from "../../../../lib/tokens"
import { authIdentityEmail, linkIdentityToVendorUser, marketplaceOf } from "../../../../lib/vendor-onboarding"
import type { AcceptInviteBody } from "../../../validators"

/** Accept a vendor invite (sent by Haanta). The invite proves the email, so it counts as verified. */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof AcceptInviteBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  if (r.auth_context?.actor_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This account already belongs to a vendor")
  const { authIdentityId, email, appMetadata } = await authIdentityEmail(r)
  const subject = await consumeToken(req.scope, "vendor_invite", req.validatedBody.token)
  const [vendorId, invitedEmail] = subject.split("|")
  if (!vendorId || invitedEmail !== email) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This invite was sent to a different email address")
  const marketplace = marketplaceOf(req)
  const [vendor] = await marketplace.listVendors({ id: vendorId })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const existingUsers = await marketplace.listVendorUsers({ vendor_id: vendorId })
  const user = await marketplace.createVendorUsers({
    email,
    name: sanitizePlainText(req.validatedBody.name, 120),
    role: existingUsers.length ? "staff" : "owner",
    email_verified_at: new Date(),
    vendor_id: vendorId,
  } as never)
  await linkIdentityToVendorUser(req, authIdentityId, appMetadata, user.id)
  await audit(r, { actor_type: "vendor", actor_id: user.id, action: "vendor.invite_accepted", entity_type: "vendor", entity_id: vendorId, after: { vendor_user_id: user.id } })
  res.status(201).json({ vendor: { id: vendor.id, name: vendor.name, status: vendor.status }, next: "sign_in_again" })
}
