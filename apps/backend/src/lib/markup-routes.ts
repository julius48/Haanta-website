import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { audit, type AnyRequest } from "./http"
import { repriceProducts } from "./catalog-ops"

type Query = { graph: (q: Record<string, unknown>) => Promise<{ data: Record<string, unknown>[] }> }

/** Vendor-level markup override. Finance role; audited; affected live products go back to review. */
export async function setVendorMarkup(req: AuthenticatedMedusaRequest<{ markup_bps: number | null; markup_fixed_minor: number | null }>, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [vendor] = await marketplace.listVendors({ id: req.params.id! })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  const b = req.validatedBody
  await marketplace.updateVendors({ id: vendor.id, markup_bps: b.markup_bps, markup_fixed_minor: b.markup_bps === null ? null : (b.markup_fixed_minor ?? 0) })
  const reprice = await repriceProducts(req.scope, { vendor_id: vendor.id })
  await audit(req as unknown as AnyRequest, {
    action: "markup.vendor",
    entity_type: "vendor",
    entity_id: vendor.id,
    before: { markup_bps: vendor.markup_bps, markup_fixed_minor: vendor.markup_fixed_minor },
    after: { ...b, reprice },
  })
  res.json({ vendor_id: vendor.id, ...b, reprice })
}

export async function setCategoryMarkup(req: AuthenticatedMedusaRequest<{ category_id: string; markup_bps: number | null; markup_fixed_minor: number }>, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const b = req.validatedBody
  const query = req.scope.resolve<Query>(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product_category", fields: ["id", "products.id"], filters: { id: b.category_id } })
  if (!data.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Category not found")
  const [existing] = await marketplace.listCategoryMarkups({ category_id: b.category_id })
  if (b.markup_bps === null) {
    if (existing) await marketplace.deleteCategoryMarkups([existing.id])
  } else if (existing) {
    await marketplace.updateCategoryMarkups({ id: existing.id, markup_bps: b.markup_bps, markup_fixed_minor: b.markup_fixed_minor })
  } else {
    await marketplace.createCategoryMarkups({ category_id: b.category_id, markup_bps: b.markup_bps, markup_fixed_minor: b.markup_fixed_minor })
  }
  const productIds = ((data[0]!.products as { id: string }[] | undefined) ?? []).map((p) => p.id)
  const reprice = productIds.length ? await repriceProducts(req.scope, { product_ids: productIds }) : { checked: 0, sent_to_review: 0 }
  await audit(req as unknown as AnyRequest, {
    action: "markup.category",
    entity_type: "product_category",
    entity_id: b.category_id,
    before: existing ? { markup_bps: existing.markup_bps, markup_fixed_minor: existing.markup_fixed_minor } : null,
    after: { ...b, reprice },
  })
  res.json({ ...b, reprice })
}

export async function setProductMarkup(req: AuthenticatedMedusaRequest<{ product_id: string; markup_bps: number | null; markup_fixed_minor: number | null }>, res: MedusaResponse) {
  const marketplace = req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const b = req.validatedBody
  const [attrs] = await marketplace.listProductAttributes({ product_id: b.product_id })
  if (!attrs) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  await marketplace.updateProductAttributes({ id: attrs.id, markup_bps: b.markup_bps, markup_fixed_minor: b.markup_bps === null ? null : (b.markup_fixed_minor ?? 0) })
  const reprice = await repriceProducts(req.scope, { product_ids: [b.product_id] })
  await audit(req as unknown as AnyRequest, {
    action: "markup.product",
    entity_type: "product",
    entity_id: b.product_id,
    before: { markup_bps: attrs.markup_bps, markup_fixed_minor: attrs.markup_fixed_minor },
    after: { ...b, reprice },
  })
  res.json({ ...b, reprice })
}
