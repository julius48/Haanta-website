/** Webhook processing with signature verification (done by callers) and idempotency by event id. */
import type { MedusaContainer } from "@medusajs/framework/types"
import { SECURITY_MODULE, type SecurityService } from "../modules/security"
import { captureAlert } from "./monitoring"

export type WebhookOutcome = "processed" | "duplicate" | "ignored"

export async function handleOnce(
  container: MedusaContainer,
  provider: string,
  eventId: string,
  type: string,
  handler: () => Promise<"processed" | "ignored">,
): Promise<WebhookOutcome> {
  const security = container.resolve<SecurityService>(SECURITY_MODULE)
  if (!(await security.claimWebhookEvent(provider, eventId, type))) return "duplicate"
  try {
    const result = await handler()
    await security.completeWebhookEvent(provider, eventId)
    return result
  } catch (e) {
    await security.completeWebhookEvent(provider, eventId, (e as Error).message.slice(0, 500))
    captureAlert("webhook_failed", { provider, event_id: eventId, type, error: (e as Error).message })
    throw e
  }
}

export function rawBodyOf(req: { rawBody?: unknown; body?: unknown }): string {
  const raw = req.rawBody
  if (Buffer.isBuffer(raw)) return raw.toString("utf8")
  if (typeof raw === "string") return raw
  return JSON.stringify(req.body ?? {})
}
