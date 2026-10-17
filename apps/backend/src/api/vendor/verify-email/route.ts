import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import { audit, type AnyRequest } from "../../../lib/http"
import { consumeToken } from "../../../lib/tokens"
import { marketplaceOf } from "../../../lib/vendor-onboarding"
import type { VerifyEmailBody } from "../../validators"

export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof VerifyEmailBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const subject = await consumeToken(req.scope, "vendor_email", req.validatedBody.token)
  // The link must belong to the signed-in user.
  if (subject !== vc.vendor_user_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This link is for a different account")
  await marketplaceOf(req).updateVendorUsers({ id: vc.vendor_user_id, email_verified_at: new Date() })
  await audit(r, { action: "vendor.email_verified", entity_type: "vendor_user", entity_id: vc.vendor_user_id })
  res.json({ verified: true })
}
