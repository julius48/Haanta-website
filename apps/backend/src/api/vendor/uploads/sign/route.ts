import { randomBytes } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { z } from "@medusajs/framework/zod"
import { getImageUploads } from "../../../../lib/adapters"
import type { AnyRequest } from "../../../../lib/http"
import type { UploadSignBody } from "../../../validators"

/**
 * Signed direct upload: the browser uploads straight to Cloudinary (or the local signed target).
 * Our servers never fetch user-supplied URLs. Types, size and folder are fixed in the signature.
 */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof UploadSignBody>>, res: MedusaResponse) {
  const vc = (req as unknown as AnyRequest).vendorContext!
  const b = req.validatedBody
  const signature = getImageUploads().sign({
    folder: `vendors/${vc.vendor_id}/${b.purpose}`,
    publicId: randomBytes(12).toString("hex"),
    contentType: b.content_type,
    size: b.size,
  })
  res.json({ upload: signature })
}
