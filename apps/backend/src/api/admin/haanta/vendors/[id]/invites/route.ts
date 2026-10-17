import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../../modules/marketplace"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { getMessenger } from "../../../../../../lib/adapters"
import { issueToken, portalUrl } from "../../../../../../lib/tokens"

/** Invite a person to a vendor account (admin only: not in the role table, so deny-by-default applies). */
export async function POST(req: AuthenticatedMedusaRequest<{ email: string }>, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [vendor] = await marketplace.listVendors({ id: req.params.id! })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const email = req.validatedBody.email
  const token = await issueToken(req.scope, "vendor_invite", `${vendor.id}|${email}`)
  await getMessenger().send({
    event: "Vendor Invite",
    audience: "vendor",
    to: { email },
    properties: { vendor: vendor.name, accept_url: portalUrl(`/invite?token=${encodeURIComponent(token)}`) },
  })
  await audit(req as unknown as AnyRequest, { action: "vendor.invited", entity_type: "vendor", entity_id: vendor.id, after: { email } })
  res.status(201).json({ invited: email })
}
