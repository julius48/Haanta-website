import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IAuthModuleService } from "@medusajs/framework/types"
import { sanitizeRichText, slugify } from "@haanta/core"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"
import { getMessenger } from "./adapters"
import { issueToken, portalUrl } from "./tokens"
import type { AnyRequest } from "./http"

/** Email of the auth identity behind a (possibly unregistered) vendor token. */
export async function authIdentityEmail(req: AnyRequest): Promise<{ authIdentityId: string; email: string; appMetadata: Record<string, unknown> }> {
  const authIdentityId = req.auth_context?.auth_identity_id
  if (!authIdentityId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign up first")
  const auth = req.scope.resolve<IAuthModuleService>(Modules.AUTH)
  const identity = await auth.retrieveAuthIdentity(authIdentityId, { relations: ["provider_identities"] })
  const email = identity.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id
  if (!email) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Email sign-in required")
  return { authIdentityId, email: email.toLowerCase(), appMetadata: (identity.app_metadata ?? {}) as Record<string, unknown> }
}

/** Bind the auth identity to the vendor user so future tokens carry actor_type=vendor, actor_id=vendor user id. */
export async function linkIdentityToVendorUser(req: MedusaRequest, authIdentityId: string, appMetadata: Record<string, unknown>, vendorUserId: string) {
  const auth = req.scope.resolve<IAuthModuleService>(Modules.AUTH)
  await auth.updateAuthIdentities({ id: authIdentityId, app_metadata: { ...appMetadata, vendor_id: vendorUserId } })
}

export async function uniqueVendorSlug(marketplace: MarketplaceService, name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "vendor"
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const [taken] = await marketplace.listVendors({ slug }, { withDeleted: true })
    if (!taken) return slug
  }
  throw new MedusaError(MedusaError.Types.CONFLICT, "Could not allocate a store URL")
}

export async function sendVerificationEmail(req: MedusaRequest, vendorUserId: string, email: string) {
  const token = await issueToken(req.scope, "vendor_email", vendorUserId)
  await getMessenger().send({
    event: "Vendor Verify Email",
    audience: "vendor",
    to: { email },
    properties: { verify_url: portalUrl(`/verify-email?token=${encodeURIComponent(token)}`) },
  })
}

export function cleanStory(story: string | null | undefined): string | null {
  const s = sanitizeRichText(story ?? "")
  return s || null
}

export const marketplaceOf = (req: MedusaRequest) => req.scope.resolve<MarketplaceService>(MARKETPLACE_MODULE)
