import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { AnyRequest } from "../../../../../lib/http"
import { vendorEarnings } from "../../../../../lib/earnings"
import { statementCsv, statementPdf, type Statement } from "../../../../../lib/statements"
import { marketplaceOf } from "../../../../../lib/vendor-onboarding"

/** Payout statement as PDF or CSV (own payouts only). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const { format } = req.validatedQuery as { format: "pdf" | "csv" }
  const { entries, payouts } = await vendorEarnings(req.scope, vc.vendor_id)
  const payout = payouts.find((p) => p.id === req.params.payout_id)
  if (!payout) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payout not found")
  const [vendor] = await marketplaceOf(req).listVendors({ id: vc.vendor_id })
  const lines = entries.filter((e) => e.payout_id === payout.id)
  const statement: Statement = {
    vendor_name: vendor!.name,
    payout_id: payout.id,
    paid_at: payout.paid_at.slice(0, 10),
    bank_reference: payout.bank_reference,
    currency: payout.currency,
    lines: lines.map((l) => ({ date: l.created_at.slice(0, 10), order: String(l.order), product: l.product, type: l.reason ?? l.type, quantity: l.quantity, amount_minor: l.amount_minor })),
    total_minor: payout.amount_minor,
  }
  const filename = `haanta-statement-${payout.id}.${format}`
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.send(statementCsv(statement))
    return
  }
  res.setHeader("Content-Type", "application/pdf")
  res.send(await statementPdf(statement))
}
