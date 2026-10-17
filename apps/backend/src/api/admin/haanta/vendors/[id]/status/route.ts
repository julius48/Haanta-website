import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IProductModuleService } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../../../modules/marketplace"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { getMessenger } from "../../../../../../lib/adapters"

const Body = z.object({ status: z.enum(["active", "paused", "rejected"]), reason: z.string().max(500).optional() }).strict()

const EVENT: Record<string, string> = { active: "Vendor Approved", paused: "Vendor Paused", rejected: "Vendor Rejected" }

/**
 * Approve (active), pause or reject a vendor (admin only). Pausing hides all of the vendor's products
 * (set to draft); reactivating republishes the approved ones.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid status")
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [vendor] = await marketplace.listVendors({ id: req.params.id! })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const next = parsed.data.status
  const updated = await marketplace.updateVendors({ id: vendor.id, status: next, ...(next === "active" && !vendor.approved_at ? { approved_at: new Date() } : {}) })
  const listings = await marketplace.listProductListings({ vendor_id: vendor.id }, { take: null })
  const productIds = listings.filter((l) => l.product_id && l.approved_snapshot).map((l) => l.product_id!)
  if (productIds.length) {
    const products = req.scope.resolve<IProductModuleService>(Modules.PRODUCT)
    await products.updateProducts({ id: productIds }, { status: next === "active" ? "published" : "draft" })
  }
  await audit(r, {
    action: `vendor.${next}`,
    entity_type: "vendor",
    entity_id: vendor.id,
    before: { status: vendor.status },
    after: { status: next, reason: parsed.data.reason ?? null, products_affected: productIds.length },
  })
  const users = await marketplace.listVendorUsers({ vendor_id: vendor.id })
  for (const u of users) {
    await getMessenger().send({ event: EVENT[next]!, audience: "vendor", to: { email: u.email }, properties: { vendor: vendor.name, reason: parsed.data.reason ?? null } })
  }
  res.json({ vendor: { id: updated.id, status: updated.status } })
}
