import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reviewDetail } from "../../../../../lib/review-queue"

/** Pending vs approved version, field diff and proposed prices for one listing. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await reviewDetail(req.scope, req.params.id!))
}
