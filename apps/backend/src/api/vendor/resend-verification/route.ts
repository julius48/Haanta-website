import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../lib/http"
import { marketplaceOf, sendVerificationEmail } from "../../../lib/vendor-onboarding"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const [user] = await marketplaceOf(req).listVendorUsers({ id: vc.vendor_user_id })
  if (user && !user.email_verified_at) await sendVerificationEmail(req, user.id, user.email)
  // Same response either way.
  res.json({ sent: true })
}
