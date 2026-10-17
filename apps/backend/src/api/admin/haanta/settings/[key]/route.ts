import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { ZodError } from "zod"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../../../modules/haanta-settings"
import { audit, type AnyRequest } from "../../../../../lib/http"
import { repriceProducts } from "../../../../../lib/catalog-ops"
import { SETTINGS_SCHEMAS, type SettingsKey } from "../../../../../lib/settings-schemas"

/**
 * Update one settings group. Partial updates are merged and the result validated by the group's schema.
 * Access: general/shipping → admin; pricing (markup defaults, rounding) → finance or admin (see rbac.ts).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const key = req.params.key as SettingsKey
  if (!(key in SETTINGS_SCHEMAS)) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Unknown settings group")
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Send a JSON object")
  const r = req as unknown as AnyRequest
  const service = req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE)
  let result
  try {
    result = await service.putSettings(key, req.body, r.auth_context!.actor_id)
  } catch (e) {
    if (e instanceof ZodError || (e as Error).name === "ZodError") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid ${key} settings: ${(e as ZodError).issues?.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`)
    }
    throw e
  }
  let reprice = null
  if (key === "pricing") reprice = await repriceProducts(req.scope, {})
  await audit(r, { action: `settings.${key}`, entity_type: "settings", entity_id: key, before: result.before, after: result.after })
  res.json({ [key]: result.after, reprice })
}
