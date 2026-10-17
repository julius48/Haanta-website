import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { vendorBalance } from "@haanta/core"
import { LEDGER_MODULE, type LedgerService } from "../../../../modules/ledger"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../../../../modules/marketplace"
import type { AnyRequest } from "../../../../lib/http"
import { recordPayout, type RecordPayoutInput } from "../../../../lib/ledger-ops"

/** Owed (pending + payable), payable now and payout history per vendor. Finance role. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const ledger = req.scope.resolve<LedgerService>(LEDGER_MODULE)
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const { state, payouts } = await ledger.loadState()
  const vendors = await marketplace.listVendors({}, { take: null })
  const now = new Date()
  const rows = vendors
    .map((v) => {
      const b = vendorBalance(v.id, state, now)
      return { vendor_id: v.id, vendor: v.name, owed_minor: b.pending_minor + b.payable_minor, payable_now_minor: b.payable_minor, pending_minor: b.pending_minor, paid_minor: b.paid_minor }
    })
    .filter((r) => r.owed_minor !== 0 || r.paid_minor !== 0)
  res.json({
    totals: {
      owed_minor: rows.reduce((n, r) => n + r.owed_minor, 0),
      payable_now_minor: rows.reduce((n, r) => n + Math.max(0, r.payable_now_minor), 0),
    },
    vendors: rows,
    history: payouts
      .sort((a, b) => b.paid_at.getTime() - a.paid_at.getTime())
      .map((p) => ({ ...p, vendor: vendors.find((v) => v.id === p.vendor_id)?.name ?? p.vendor_id, paid_at: p.paid_at.toISOString() })),
  })
}

/** Record a manual payout: marks the covered entries paid and emails the vendor a statement. */
export async function POST(req: AuthenticatedMedusaRequest<RecordPayoutInput>, res: MedusaResponse) {
  const actor = (req as unknown as AnyRequest).auth_context!.actor_id
  const result = await recordPayout(req.scope, req.validatedBody, actor)
  res.status(201).json({ payout: result.payout, entries_paid: result.entry_ids.length })
}
