import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { audit, type AnyRequest } from "../../../../../../lib/http"
import { deleteCustomerData } from "../../../../../../lib/privacy"

/** Erase a buyer's personal data (admin only; requires { confirm: "DELETE" }). */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const result = await deleteCustomerData(req.scope, req.params.customer_id!)
  await audit(req as unknown as AnyRequest, { action: "privacy.delete", entity_type: "customer", entity_id: req.params.customer_id!, after: result })
  res.json(result)
}
