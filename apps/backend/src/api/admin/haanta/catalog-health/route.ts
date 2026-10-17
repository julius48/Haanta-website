import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { catalogHealth } from "../../../../lib/admin-reports"

/** Top sellers, no sales, low or out of stock, products missing weight or size chart. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await catalogHealth(req.scope))
}
