import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import { sanitizePlainText } from "@haanta/core"
import { audit, type AnyRequest } from "../../../lib/http"
import { cleanStory, marketplaceOf } from "../../../lib/vendor-onboarding"
import type { StorePageBody } from "../../validators"

const pageFields = (v: Record<string, unknown>) => ({
  name: v.name,
  slug: v.slug,
  logo_url: v.logo_url,
  banner_url: v.banner_url,
  story: v.story,
  policies: v.policies,
  size_notes: v.size_notes,
  region: v.region,
  origin_country: v.origin_country,
  status: v.status,
})

/** The vendor's public store page (logo, banner, story, policies). Preview renders this exact payload. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const [vendor] = await marketplaceOf(req).listVendors({ id: vc.vendor_id })
  res.json({ store: pageFields(vendor as unknown as Record<string, unknown>), preview_path: `/brands/${vendor!.slug}?preview=1` })
}

export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof StorePageBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  const vc = r.vendorContext!
  const marketplace = marketplaceOf(req)
  const [before] = await marketplace.listVendors({ id: vc.vendor_id })
  const b = req.validatedBody
  const update: Record<string, unknown> = { id: vc.vendor_id }
  if (b.logo_url !== undefined) update.logo_url = b.logo_url
  if (b.banner_url !== undefined) update.banner_url = b.banner_url
  if (b.story !== undefined) update.story = cleanStory(b.story)
  if (b.policies !== undefined) update.policies = b.policies ? sanitizePlainText(b.policies, 5000) : null
  if (b.size_notes !== undefined) update.size_notes = b.size_notes ? sanitizePlainText(b.size_notes, 300) : null
  if (b.region !== undefined) update.region = b.region ? sanitizePlainText(b.region, 120) : null
  const after = await marketplace.updateVendors(update as never)
  await audit(r, { action: "vendor.store_page_updated", entity_type: "vendor", entity_id: vc.vendor_id, before: pageFields(before as unknown as Record<string, unknown>), after: pageFields(after as unknown as Record<string, unknown>) })
  res.json({ store: pageFields(after as unknown as Record<string, unknown>) })
}
