import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { processOrder } from "../lib/ledger-ops"
import { captureAlert } from "../lib/monitoring"

/** Split the order per vendor, snapshot prices, create ledger entries, notify vendors and the buyer. */
export default async function orderPlaced({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  try {
    await processOrder(container, data.id)
  } catch (e) {
    captureAlert("webhook_failed", { stage: "order.placed", order_id: data.id, error: (e as Error).message })
    throw e
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
