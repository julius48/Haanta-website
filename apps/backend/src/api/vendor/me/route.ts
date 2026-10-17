import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../lib/http"
import { mfaStatus } from "../../../lib/mfa"
import { marketplaceOf } from "../../../lib/vendor-onboarding"

/** The signed-in vendor user and their vendor (own data only). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const marketplace = marketplaceOf(req)
  const [user] = await marketplace.listVendorUsers({ id: vc.vendor_user_id })
  const [vendor] = await marketplace.listVendors({ id: vc.vendor_id })
  const mfa = await mfaStatus(req, "vendor", vc.vendor_user_id)
  res.json({
    user: { id: user!.id, name: user!.name, email: user!.email, role: user!.role, email_verified: !!user!.email_verified_at },
    vendor: {
      id: vendor!.id,
      name: vendor!.name,
      slug: vendor!.slug,
      status: vendor!.status,
      logo_url: vendor!.logo_url,
      banner_url: vendor!.banner_url,
      origin_country: vendor!.origin_country,
      region: vendor!.region,
    },
    mfa,
  })
}
