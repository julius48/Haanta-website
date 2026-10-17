import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { processOrder } from "../lib/ledger-ops"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/** Delayed captures (e.g. Klarna) create ledger entries when the money actually arrives. */
export default async function paymentCaptured({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data: payments } = await query.graph({ entity: "payment", fields: ["id", "payment_collection.order.id"], filters: { id: data.id } })
  const orderId = (payments[0]?.payment_collection as { order?: { id?: string } } | undefined)?.order?.id
  if (orderId) await processOrder(container, orderId, { notify: false })
}

export const config: SubscriberConfig = { event: "payment.captured" }
