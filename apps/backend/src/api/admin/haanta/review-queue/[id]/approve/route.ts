import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../../../../lib/http"
import { approveListing } from "../../../../../../lib/review-queue"

export async function POST(req: AuthenticatedMedusaRequest<{ note?: string }>, res: MedusaResponse) {
  const actor = (req as unknown as AnyRequest).auth_context!.actor_id
  const listing = await approveListing(req.scope, req.params.id!, actor, req.validatedBody.note)
  res.json({ listing: { id: listing.id, status: listing.status, product_id: listing.product_id } })
}
