import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { AnyRequest } from "../../../../../../lib/http"
import { requestChanges } from "../../../../../../lib/review-queue"

/** Send back to the vendor with a note. A live product keeps its approved version. */
export async function POST(req: AuthenticatedMedusaRequest<{ note: string }>, res: MedusaResponse) {
  const actor = (req as unknown as AnyRequest).auth_context!.actor_id
  const listing = await requestChanges(req.scope, req.params.id!, actor, req.validatedBody.note)
  res.json({ listing: { id: listing.id, status: listing.status, review_note: listing.review_note } })
}
