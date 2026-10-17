import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { REVIEWS_MODULE, type ReviewsService } from "../../../../../modules/reviews"
import { audit, type AnyRequest } from "../../../../../lib/http"

export async function POST(req: AuthenticatedMedusaRequest<{ status: "approved" | "rejected" }>, res: MedusaResponse) {
  const reviews = req.scope.resolve<ReviewsService>(REVIEWS_MODULE)
  const [review] = await reviews.listProductReviews({ id: req.params.id! })
  if (!review) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
  const updated = await reviews.updateProductReviews({ id: review.id, status: req.validatedBody.status })
  await audit(req as unknown as AnyRequest, { action: "review.moderated", entity_type: "product_review", entity_id: review.id, before: { status: review.status }, after: { status: updated.status } })
  res.json({ review: { id: updated.id, status: updated.status } })
}
