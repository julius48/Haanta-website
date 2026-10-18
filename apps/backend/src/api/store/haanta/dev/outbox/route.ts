import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { outbox } from "../../../../../lib/adapters"

/**
 * Local development and e2e only: the mock Klaviyo outbox (emails/SMS that would have been sent).
 * Returns 404 in production and whenever a real Klaviyo key is configured.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (process.env.NODE_ENV === "production" || process.env.KLAVIYO_PRIVATE_KEY) {
    res.status(404).json({ message: "Not found" })
    return
  }
  const to = String((req.query as Record<string, string>).to ?? "").toLowerCase()
  const messages = outbox.filter((m) => !to || m.to.email?.toLowerCase() === to).slice(-50)
  res.json({ messages })
}
