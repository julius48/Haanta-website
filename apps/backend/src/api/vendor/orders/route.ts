import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import type { AnyRequest } from "../../../lib/http"
import { buildVendorOrderViews } from "../../../lib/vendor-orders"
import { marketplaceOf } from "../../../lib/vendor-onboarding"
import type { VendorListQuery } from "../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const { limit, offset, status } = req.validatedQuery as z.infer<typeof VendorListQuery>
  const [rows, count] = await marketplaceOf(req).listAndCountVendorOrders(
    { vendor_id: vc.vendor_id, ...(status ? { status: status as never } : {}) },
    { take: limit, skip: offset, order: { created_at: "DESC" } },
  )
  const views = await buildVendorOrderViews(req, vc.vendor_id, rows as unknown as Record<string, unknown>[])
  res.json({
    orders: views.map((v, i) => ({ ...v, ship_by: rows[i]!.ship_by, is_late: !!rows[i]!.ship_by && !rows[i]!.shipped_at && new Date(rows[i]!.ship_by!).getTime() < Date.now() })),
    count,
    limit,
    offset,
  })
}
