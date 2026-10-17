import { createHash, randomBytes } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE, type MarketplaceService } from "../modules/marketplace"

export type TokenPurpose = "vendor_email" | "vendor_invite"

const TTL_MS: Record<TokenPurpose, number> = { vendor_email: 48 * 3600_000, vendor_invite: 7 * 24 * 3600_000 }

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex")

/** Issue a single-use token. Only its hash is stored; the raw token goes in the emailed link. */
export async function issueToken(container: MedusaContainer, purpose: TokenPurpose, subject: string): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await container.resolve<MarketplaceService>(MARKETPLACE_MODULE).createVerificationTokens({
    purpose,
    subject,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TTL_MS[purpose]),
  })
  return token
}

/** Consume a token: valid, unexpired, unused and for this purpose. Returns its subject. */
export async function consumeToken(container: MedusaContainer, purpose: TokenPurpose, token: string): Promise<string> {
  const marketplace = container.resolve<MarketplaceService>(MARKETPLACE_MODULE)
  const [row] = await marketplace.listVerificationTokens({ token_hash: hashToken(token), purpose })
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This link is invalid or has expired")
  }
  await marketplace.updateVerificationTokens({ id: row.id, used_at: new Date() })
  return row.subject
}

export function portalUrl(path: string): string {
  return `${process.env.VENDOR_PORTAL_URL || "http://localhost:3001"}${path}`
}
