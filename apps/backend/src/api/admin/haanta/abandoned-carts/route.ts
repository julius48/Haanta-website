import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { abandonedCarts } from "../../../../lib/admin-reports"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const days = Math.min(90, Math.max(1, Number((req.query as Record<string, string>).days) || 14))
  res.json({ carts: await abandonedCarts(req.scope, days) })
}
