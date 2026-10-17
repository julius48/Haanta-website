import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminOrders } from "../../../../lib/admin-reports"

/** Orders with origin (US, Nigeria, mixed), shipping option, vendor status, tracking and risk flag. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await adminOrders(req.scope, req.validatedQuery as { limit: number; offset: number; origin?: string; risk?: string }))
}
