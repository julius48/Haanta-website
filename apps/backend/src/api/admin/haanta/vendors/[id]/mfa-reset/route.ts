import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../../modules/marketplace"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { resetFactor } from "../../../../../../lib/mfa"

const Body = z.object({ vendor_user_id: z.string().max(64) }).strict()

/** Remove a vendor user's TOTP factor after verifying their identity out of band (admin only). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "vendor_user_id required")
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [user] = await marketplace.listVendorUsers({ id: parsed.data.vendor_user_id, vendor_id: req.params.id! })
  if (!user) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor user not found")
  await resetFactor(req, "vendor", user.id)
  await audit(req as unknown as AnyRequest, { action: "mfa.reset", entity_type: "vendor_user", entity_id: user.id })
  res.json({ reset: true })
}
