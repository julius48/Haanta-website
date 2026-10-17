import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reconcile } from "@haanta/core"
import { LEDGER_MODULE, type LedgerService } from "../../../../modules/ledger"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import { captureAlert } from "../../../../lib/monitoring"

/** Ledger totals vs recorded payouts per vendor. Any mismatch raises an alert. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const ledger = req.scope.resolve<LedgerService>(LEDGER_MODULE)
  const vendors = await req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE).listVendors({}, { take: null })
  const { state, payouts } = await ledger.loadState()
  const rows = reconcile(vendors.map((v) => v.id), state, payouts, new Date()).map((r) => ({ ...r, vendor: vendors.find((v) => v.id === r.vendor_id)?.name }))
  const mismatches = rows.filter((r) => !r.ok)
  if (mismatches.length) captureAlert("ledger_reconciliation_mismatch", { vendors: mismatches.map((m) => m.vendor_id) })
  res.json({ ok: mismatches.length === 0, rows })
}
