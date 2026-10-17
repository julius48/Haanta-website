import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../modules/marketplace"
import { vendorEarnings } from "../../../../../lib/earnings"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [vendor] = await marketplace.listVendors({ id: req.params.id! })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const users = await marketplace.listVendorUsers({ vendor_id: vendor.id })
  const { balance, payouts } = await vendorEarnings(req.scope, vendor.id)
  res.json({
    vendor,
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, email_verified: !!u.email_verified_at })),
    balance,
    payouts,
  })
}
