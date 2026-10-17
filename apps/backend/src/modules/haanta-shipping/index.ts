import { AbstractFulfillmentProviderService, MedusaError, ModuleProvider, Modules } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import { cartFingerprint, loadQuote } from "../../lib/quote-store"

export const HAANTA_SHIPPING_OPTION_ID = "haanta-calculated"
const QUOTE_CODE = /^[a-z0-9_-]{2,40}$/i

/**
 * Haanta shipping fulfilment provider. One calculated shipping option per service zone; the buyer
 * picks a quote code from POST /store/carts/:id/shipping-quotes and this provider looks the price up
 * from the server-side quote for the same cart fingerprint.
 */
class HaantaShippingProvider extends AbstractFulfillmentProviderService {
  static identifier = "haanta"

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: HAANTA_SHIPPING_OPTION_ID, name: "Haanta shipping (calculated by the shipping engine)" }]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return data.id === HAANTA_SHIPPING_OPTION_ID
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  async validateFulfillmentData(_optionData: Record<string, unknown>, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const code = data?.quote_code
    if (typeof code !== "string" || !QUOTE_CODE.test(code)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a shipping option")
    }
    return { quote_code: code }
  }

  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"],
  ): Promise<CalculatedShippingOptionPrice> {
    const code = data?.quote_code
    if (typeof code !== "string") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a shipping option")
    const quote = await loadQuote(context.id)
    const currency = String((context as { currency_code?: string }).currency_code ?? quote?.currency ?? "usd")
    const fingerprint = cartFingerprint({
      items: (context.items ?? []).map((i) => ({ variant_id: i.variant_id, quantity: i.quantity as unknown as number, unit_price: i.unit_price as unknown as number })),
      address: context.shipping_address,
      currency,
    })
    if (!quote || quote.fingerprint !== fingerprint) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Your cart or address changed. Please refresh shipping options.")
    }
    const option = quote.options.find((o) => o.code === code)
    if (!option) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That shipping option is not available for this cart")
    // Quotes are only stored in the cart currency (see the quote endpoint), so the amount is in cart currency.
    return { calculated_amount: option.amount, is_calculated_price_tax_inclusive: true }
  }

  async createFulfillment(): Promise<CreateFulfillmentResult> {
    // Labels are bought from ShipEngine by the hub team (see /admin/haanta/orders/:id/label).
    return { data: {}, labels: [] }
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {}
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] }
  }
}

export default ModuleProvider(Modules.FULFILLMENT, { services: [HaantaShippingProvider] })
