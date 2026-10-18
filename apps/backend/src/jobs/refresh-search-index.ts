import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { refreshSearchIndex } from "../lib/search"

/**
 * Safety net for the search index: product and order events trigger rebuilds (subscribers/search-index),
 * and this catches anything that changes without an event (e.g. markup repricing) every 15 minutes.
 */
export default async function refreshSearchIndexJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const started = Date.now()
  const count = await refreshSearchIndex(container)
  logger.debug(`[search] index refreshed: ${count} products in ${Date.now() - started} ms`)
}

export const config = { name: "refresh-search-index", schedule: "*/15 * * * *" }
