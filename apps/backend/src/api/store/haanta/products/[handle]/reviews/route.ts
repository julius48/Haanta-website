import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { ICustomerModuleService } from "@medusajs/framework/types"
import { sanitizePlainText } from "@haanta/core"
import { REVIEWS_MODULE, type ReviewsService } from "../../../../../../modules/reviews"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/**
 * Submit a review (signed-in buyers; rate limited). The route param is the product id. Text is
 * sanitised; photos must be Haanta-hosted uploads; reviews are moderated before they appear.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<{ rating: number; title?: string; body: string; fit?: "runs_small" | "true_to_size" | "runs_large"; photos: string[] }>,
  res: MedusaResponse,
) {
  const productId = req.params.handle!
  const customerId = req.auth_context.actor_id
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({ entity: "product", fields: ["id"], filters: { id: productId, status: "published" } })
  if (!products.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  const reviews = req.scope.resolve<ReviewsService>(REVIEWS_MODULE)
  const [existing] = await reviews.listProductReviews({ product_id: productId, customer_id: customerId })
  if (existing) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "You've already reviewed this product")
  const customer = await req.scope.resolve<ICustomerModuleService>(Modules.CUSTOMER).retrieveCustomer(customerId)
  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "items.product_id"], filters: { customer_id: customerId } })
  const verified = orders.some((o) => ((o.items as { product_id?: string }[] | undefined) ?? []).some((i) => i.product_id === productId))
  const b = req.validatedBody
  const review = await reviews.createProductReviews({
    product_id: productId,
    customer_id: customerId,
    display_name: `${sanitizePlainText(customer.first_name ?? "Haanta", 40) || "Haanta"} ${(customer.last_name ?? "").slice(0, 1).toUpperCase()}${customer.last_name ? "." : ""}`.trim(),
    verified_purchase: verified,
    rating: b.rating,
    title: b.title ? sanitizePlainText(b.title, 120) : null,
    body: sanitizePlainText(b.body, 3000),
    fit: b.fit ?? null,
    photos: b.photos,
    status: "pending",
  })
  res.status(201).json({ review: { id: review.id, status: review.status } })
}
