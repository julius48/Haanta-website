import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import type { AnyRequest } from "../../../../lib/http"
import { previewPrices } from "../../../../lib/vendor-listings"
import type { PricePreviewBody } from "../../../validators"

/** Show the vendor the storefront price before they submit. Always computed on the server. */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof PricePreviewBody>>, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const b = req.validatedBody
  res.json({ prices: await previewPrices(req, vc.vendor_id, null, { category_ids: b.category_ids, variants: b.variants as never }) })
}
