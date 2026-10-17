import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE, type ReviewsService } from "../../../../modules/reviews"

/** Buyer reviews awaiting moderation (or filtered by status). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const status = String((req.query as Record<string, string>).status ?? "pending")
  const allowed = ["pending", "approved", "rejected"]
  const [reviews, count] = await req.scope
    .resolve<ReviewsService>(REVIEWS_MODULE)
    .listAndCountProductReviews(allowed.includes(status) ? { status: status as never } : {}, { take: 100, order: { created_at: "ASC" } })
  res.json({ reviews, count })
}
