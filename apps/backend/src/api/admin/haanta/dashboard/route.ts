import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { dashboard } from "../../../../lib/admin-reports"

/** Today: sales, orders, average order value, conversion, live visitors; plus funnel and abandoned carts. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { days } = req.validatedQuery as { days: number }
  res.json(await dashboard(req.scope, days))
}
