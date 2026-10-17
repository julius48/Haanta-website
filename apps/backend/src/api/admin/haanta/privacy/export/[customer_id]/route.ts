import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { exportCustomerData } from "../../../../../../lib/privacy"

/** Export everything held about a buyer (support or admin). The export itself is audited. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const data = await exportCustomerData(req.scope, req.params.customer_id!)
  await audit(req as unknown as AnyRequest, { action: "privacy.export", entity_type: "customer", entity_id: req.params.customer_id! })
  res.setHeader("Content-Disposition", `attachment; filename="customer-${req.params.customer_id}.json"`)
  res.json(data)
}
