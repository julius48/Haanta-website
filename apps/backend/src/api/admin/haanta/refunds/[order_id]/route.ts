import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { ReversalReason } from "@haanta/core"
import { audit, type AnyRequest } from "../../../../../lib/http"
import { refundLines } from "../../../../../lib/refunds"

/** Refund or return specific units (finance). Refunds the buyer and reverses the vendor's earnings. */
export async function POST(req: AuthenticatedMedusaRequest<{ lines: { line_item_id: string; quantity: number }[]; reason: ReversalReason; note?: string }>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const b = req.validatedBody
  const result = await refundLines(req.scope, req.params.order_id!, b.lines, b.reason, r.auth_context!.actor_id)
  await audit(r, { action: `order.${b.reason}`, entity_type: "order", entity_id: req.params.order_id!, after: { ...result, lines: b.lines, note: b.note ?? null } })
  res.json(result)
}
