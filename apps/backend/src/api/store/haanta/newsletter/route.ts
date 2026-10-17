import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMessenger } from "../../../../lib/adapters"

/** Newsletter signup (Klaviyo list). Same response whether or not the email was already subscribed. */
export async function POST(req: MedusaRequest<{ email: string; source: string }>, res: MedusaResponse) {
  await getMessenger().subscribe(req.validatedBody.email, "newsletter")
  res.json({ subscribed: true })
}
