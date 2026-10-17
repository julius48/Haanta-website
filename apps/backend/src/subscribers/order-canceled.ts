import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { reverseWholeOrder } from "../lib/ledger-ops"

/** A cancelled order reverses every vendor earning still on it (reversing entries; nothing is deleted). */
export default async function orderCanceled({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  await reverseWholeOrder(container, data.id, "cancellation", `order-canceled:${data.id}`)
}

export const config: SubscriberConfig = { event: "order.canceled" }
