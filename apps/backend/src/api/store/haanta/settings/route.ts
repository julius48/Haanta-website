import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../../modules/haanta-settings"

/** Public, non-sensitive settings the storefront needs (popup, duties text, free-shipping threshold). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const s = req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE)
  const [general, shipping] = await Promise.all([s.getSettings("general"), s.getSettings("shipping")])
  res.setHeader("Cache-Control", "public, max-age=300")
  res.json({
    newsletter_popup: general.newsletterPopup,
    duties_message: general.dutiesMessage,
    ready_to_wear_dispatch: general.readyToWearDispatchHours,
    free_shipping_threshold_usd: shipping.freeShippingThresholdUsd,
    return_window_days: general.returnWindowDays,
  })
}
