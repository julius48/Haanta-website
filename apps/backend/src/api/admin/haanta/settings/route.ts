import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../../modules/haanta-settings"

/** All Haanta settings (shipping, markup defaults, rounding, return window, hub address …). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const s = req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE)
  const [general, shipping, pricing] = await Promise.all([s.getSettings("general"), s.getSettings("shipping"), s.getSettings("pricing")])
  res.json({ general, shipping, pricing })
}
