import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { scheduleSearchRefresh } from "../lib/search"

/** Catalog and stock changes refresh the search index (debounced; see lib/search.ts). */
export default async function searchIndex({ container }: SubscriberArgs<{ id: string }>) {
  scheduleSearchRefresh(container)
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted", "order.placed", "order.canceled"],
}
