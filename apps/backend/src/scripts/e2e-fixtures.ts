/**
 * Prepare the local e2e fixtures (run before the storefront Playwright suite): publishes the four
 * seeded fixture products and resets their stock to 100, so checkout tests never run out. Only those
 * handles are touched (never a vendor submission waiting for review). They stay hidden from search
 * (see lib/fixtures.ts). Refuses to run in production.
 * Run: pnpm --dir apps/backend exec medusa exec ./src/scripts/e2e-fixtures.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { batchInventoryItemLevelsWorkflow } from "@medusajs/medusa/core-flows"
import { FIXTURE_PRODUCT_HANDLES } from "../lib/fixtures"

const STOCK = 100

export default async function e2eFixtures({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  if (process.env.NODE_ENV === "production") throw new Error("e2e fixtures are local only")

  const products = container.resolve(Modules.PRODUCT)
  const productIds = (await products.listProducts({ handle: [...FIXTURE_PRODUCT_HANDLES] }, { select: ["id"] })).map((p) => p.id)
  if (!productIds.length) throw new Error("No fixture products found: run the seed script first")
  for (const id of productIds) await products.updateProducts(id, { status: "published" })

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.location_id"],
    filters: { product_id: productIds },
  })
  const update: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  for (const v of variants) {
    for (const link of (v.inventory_items as { inventory_item_id: string; inventory?: { location_levels?: { location_id: string }[] } }[] | undefined) ?? []) {
      for (const level of link.inventory?.location_levels ?? []) update.push({ inventory_item_id: link.inventory_item_id, location_id: level.location_id, stocked_quantity: STOCK })
    }
  }
  if (update.length) await batchInventoryItemLevelsWorkflow(container).run({ input: { create: [], update, delete: [] } })
  logger.info(`[e2e-fixtures] ${productIds.length} demo products published; ${update.length} stock levels set to ${STOCK}`)
}
