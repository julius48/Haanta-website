import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"
import { sanitizePlainText } from "@haanta/core"
import { audit, type AnyRequest } from "../../../lib/http"
import { getMessenger } from "../../../lib/adapters"
import { authIdentityEmail, cleanStory, linkIdentityToVendorUser, marketplaceOf, sendVerificationEmail, uniqueVendorSlug } from "../../../lib/vendor-onboarding"
import type { VendorApplicationBody } from "../../validators"

/**
 * Vendor application. Called with the registration token from POST /auth/vendor/emailpass/register.
 * Creates a pending vendor (Haanta must approve before anything is listed) and its owner user.
 */
export async function POST(req: AuthenticatedMedusaRequest<z.infer<typeof VendorApplicationBody>>, res: MedusaResponse) {
  const r = req as unknown as AnyRequest
  if (r.auth_context?.actor_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This account already belongs to a vendor")
  const { authIdentityId, email, appMetadata } = await authIdentityEmail(r)
  const marketplace = marketplaceOf(req)
  const [existingUser] = await marketplace.listVendorUsers({ email })
  if (existingUser) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This email already belongs to a vendor")
  const b = req.validatedBody
  const vendor = await marketplace.createVendors({
    name: sanitizePlainText(b.business_name, 120),
    slug: await uniqueVendorSlug(marketplace, b.business_name),
    origin_country: b.origin_country,
    region: b.region ? sanitizePlainText(b.region, 120) : null,
    story: cleanStory(b.story),
    contact_email: email,
    status: "pending",
  })
  const user = await marketplace.createVendorUsers({ email, name: sanitizePlainText(b.contact_name, 120), role: "owner", vendor_id: vendor.id } as never)
  await linkIdentityToVendorUser(req, authIdentityId, appMetadata, user.id)
  await sendVerificationEmail(req, user.id, email)
  await getMessenger().send({
    event: "Vendor Application Received",
    audience: "staff",
    to: { email: process.env.HAANTA_OPS_EMAIL || "ops@haanta.com" },
    properties: { vendor_id: vendor.id, vendor_name: vendor.name, website: b.website ?? null, instagram: b.instagram ?? null },
  })
  await audit(r, { actor_type: "vendor", actor_id: user.id, action: "vendor.applied", entity_type: "vendor", entity_id: vendor.id, after: { name: vendor.name, status: vendor.status } })
  res.status(201).json({ vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug, status: vendor.status }, next: "sign_in_again" })
}
