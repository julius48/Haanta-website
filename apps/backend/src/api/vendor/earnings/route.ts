import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../lib/http"
import { vendorEarnings } from "../../../lib/earnings"

/** Every sale line with its ledger status (pending, payable, paid), balances and payout history. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const { balance, entries, payouts } = await vendorEarnings(req.scope, vc.vendor_id)
  res.json({ balance, entries, payouts })
}
