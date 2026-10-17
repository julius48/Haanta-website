import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { vendorEarnings } from "../../../../../lib/earnings"

/** One vendor's ledger lines with status (finance). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { balance, entries, payouts } = await vendorEarnings(req.scope, req.params.vendor_id!)
  res.json({ balance, entries, payouts })
}
