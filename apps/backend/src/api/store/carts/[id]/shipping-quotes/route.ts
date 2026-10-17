import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HAANTA_SETTINGS_MODULE, type HaantaSettingsService } from "../../../../../modules/haanta-settings"
import { quoteForCart } from "../../../../../lib/shipping-quotes"

/**
 * Shipping options for a cart from the Haanta shipping engine. Rate limited and cached per cart
 * (UPS calls cost money). To choose one: POST /store/carts/:id/shipping-methods with
 * { option_id: shipping_option_id, data: { quote_code } }. The price is recomputed on the server.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const quote = await quoteForCart(req.scope, req.params.id!)
  const general = await req.scope.resolve<HaantaSettingsService>(HAANTA_SETTINGS_MODULE).getSettings("general")
  res.json({
    shipping_option_id: quote.shipping_option_id,
    origin: quote.origin,
    currency: quote.currency,
    cached: quote.cached,
    duties_message: general.dutiesMessage,
    options: quote.options.map((o) => ({ code: o.code, title: o.title, delivery_time: o.deliveryTime, amount: o.amount, currency: o.currency, carrier: o.carrier })),
  })
}
