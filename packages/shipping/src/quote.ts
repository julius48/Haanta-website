/**
 * Port of docs/legacy/wix-shipping.js (getShippingRates). With DEFAULT_SHIPPING_SETTINGS the
 * output matches the Wix code. Behaviour is pure and deterministic given the adapter results.
 */
import type { ShippingSettings } from "./settings"
import type {
  CartOrigin,
  ExchangeRateAdapter,
  ShippingAdapters,
  ShippingCart,
  ShippingDestination,
  ShippingOption,
  ShippingQuote,
  UpsRatedShipment,
  UpsShopRequest,
} from "./types"

const KG_TO_LBS = 2.20462

const UPS_SERVICE_NAMES: Record<string, string> = {
  "01": "Next Day Air",
  "02": "2nd Day Air",
  "03": "Ground",
  "07": "Worldwide Express",
  "08": "Worldwide Expedited",
  "11": "Standard to Canada",
  "12": "3 Day Select",
  "13": "Next Day Air Saver",
  "65": "Worldwide Saver",
}

/** "US-AK" → "AK", "ak" → "AK". */
export function normaliseSubdivision(subdivision: string | null | undefined): string {
  if (!subdivision) return ""
  const s = subdivision.includes("-") ? subdivision.split("-")[1] ?? "" : subdivision
  return s.trim().toUpperCase()
}

function formatUsdThreshold(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Resolve with the adapter value, or `fallback` after timeoutMs or on error. Never rejects. */
async function withTimeout<T>(p: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs)
  })
  try {
    return await Promise.race([p.catch(() => fallback), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Legacy getUSDConversionRateWithTimeout: live NGN rate capped at the cap; fallback on timeout/error. */
export async function getNgnPerUsd(fx: ExchangeRateAdapter, settings: ShippingSettings): Promise<number> {
  const live = await withTimeout(fx.usdTo("NGN"), settings.fxTimeoutMs, settings.ngnPerUsdFallback)
  if (!Number.isFinite(live) || live <= 0) return settings.ngnPerUsdFallback
  return live > settings.ngnPerUsdCap ? settings.ngnPerUsdCap : live
}

/** Legacy getFezBasePrice, plus optional Lozenge Flex / per-kg pricing above the last tier. */
export function getFezBasePriceNgn(totalWeightKg: number, settings: ShippingSettings): number {
  const tier = settings.fezTiers.find((t) => totalWeightKg <= t.maxWeightKg)
  if (tier) return tier.priceNgn
  if (!settings.gapFixes.fezPerKgAboveMax) return settings.fezOverMaxFallbackNgn
  const flex = settings.lozengeFlexTiers.find((t) => totalWeightKg <= t.maxWeightKg)
  if (flex) return flex.priceNgn
  const last = settings.lozengeFlexTiers.at(-1) ?? settings.fezTiers.at(-1)
  if (!last) return settings.fezOverMaxFallbackNgn
  const extraKg = Math.ceil(totalWeightKg - last.maxWeightKg)
  return Math.round((last.priceNgn + extraKg * settings.perKgAboveMaxNgn) * 100) / 100
}

export async function quoteShipping(
  cart: ShippingCart,
  destination: ShippingDestination,
  settings: ShippingSettings,
  adapters: ShippingAdapters,
): Promise<ShippingQuote> {
  let nigeriaWeight = 0
  let usSubtotal = 0
  let nigeriaSubtotal = 0
  let hasUSItems = false
  let hasNigeriaItems = false
  let hasPreOrderItems = false
  const usLines: { quantity: number; weightKg: number }[] = []
  const defaultedWeightLineIds: string[] = []

  const destCountry = (destination.country || "US").toUpperCase()
  const stateCode = normaliseSubdivision(destination.subdivision)
  const checkoutCurrency = cart.currency || "USD"

  for (const line of cart.lines) {
    if (line.isPreorder) hasPreOrderItems = true
    const quantity = line.quantity || 1
    const unit = Number(line.unitPriceUsd) || 0
    const lineTotal = unit * quantity
    const weightKg = line.weightKg || settings.defaultWeightKg
    if (!line.weightKg) defaultedWeightLineIds.push(line.id)
    if (line.location === "houston") {
      hasUSItems = true
      usSubtotal += lineTotal
      usLines.push({ quantity, weightKg })
    } else {
      hasNigeriaItems = true
      nigeriaSubtotal += lineTotal
      nigeriaWeight += weightKg * quantity
    }
  }

  if (!hasUSItems && !hasNigeriaItems) return { options: [], origin: null, defaultedWeightLineIds }
  const origin: CartOrigin = hasUSItems && hasNigeriaItems ? "mixed" : hasUSItems ? "us" : "ng"

  const isNorthAmerica = destCountry === "US" || destCountry === "CA" || destCountry === "MX"
  const isUpsException =
    settings.upsExceptionCountries.includes(destCountry) ||
    (destCountry === "US" && settings.upsExceptionStates.includes(stateCode))
  const totalCartSubtotal = usSubtotal + nigeriaSubtotal
  const freeBasisSubtotal = settings.freeShippingBasis === "cart_total" ? totalCartSubtotal : usSubtotal
  const threshold = settings.freeShippingThresholdUsd
  const t = settings.deliveryText

  // --- Timeline text ---
  const prodText = hasPreOrderItems ? t.preorderSuffix : ""
  const shortProdText = hasPreOrderItems ? t.preorderShortSuffix : ""
  const ngStdDays = `${t.ngStandard}${prodText}`
  const ngExpDays = `${t.ngExpedited}${prodText}`
  const usStdDays = `${t.usStandard}${prodText}`
  const mixedStdTimeline = `Shipping from US: ${t.usStandard}${shortProdText} | Shipping from Nigeria: ${t.ngStandard}${shortProdText}`
  const mixedExpTimeline = `Shipping from US: ${t.usExpedited}${shortProdText} | Shipping from Nigeria: ${t.ngExpedited}${shortProdText}`

  // --- Currency handling ---
  // Legacy: amounts are USD but labelled with the checkout currency. Gap fix: convert.
  let conversion: Promise<{ rate: number; currency: string } | null> | null = null
  const getConversion = () => {
    if (!settings.gapFixes.convertToCheckoutCurrency || checkoutCurrency.toUpperCase() === "USD") {
      return Promise.resolve(null)
    }
    conversion ??= withTimeout(
      adapters.fx.usdTo(checkoutCurrency).then((rate) => ({ rate, currency: checkoutCurrency })),
      settings.fxTimeoutMs,
      null,
    )
    return conversion
  }
  /** Build final price/currency. `legacyPrice` is what Wix would have shown. */
  const money = async (usd: number, legacyPrice: string, legacyCurrency: string) => {
    if (!settings.gapFixes.convertToCheckoutCurrency) return { price: legacyPrice, currency: legacyCurrency }
    const conv = await getConversion()
    if (!conv) return { price: usd.toFixed(2), currency: "USD" }
    return { price: (usd * conv.rate).toFixed(2), currency: conv.currency }
  }

  // --- UPS helpers ---
  const buildUpsRequest = (): UpsShopRequest => ({
    destination: { ...destination, country: destCountry, stateCode },
    packages: usLines.map((l) => ({
      weightLbs: Math.ceil(
        l.quantity * (settings.gapFixes.upsUseRealWeight ? l.weightKg : settings.upsAssumedKgPerUnit) * KG_TO_LBS,
      ),
    })),
  })
  const upsFallbackUsd = (): number =>
    destCountry === "CA"
      ? settings.upsFallbackUsd.CA
      : destCountry === "US"
        ? settings.upsFallbackUsd.US
        : settings.upsFallbackUsd.international

  async function getFullUpsRates(): Promise<ShippingOption[]> {
    const isCA = destCountry === "CA"
    let shipments: UpsRatedShipment[]
    try {
      shipments = await adapters.ups.shop(buildUpsRequest())
      if (shipments.length === 0) throw new Error("Invalid UPS response")
    } catch {
      const usd = upsFallbackUsd()
      const m = await money(usd, usd.toFixed(2), checkoutCurrency)
      return [
        {
          code: "ups-fallback",
          title: isCA ? "UPS® Standard to Canada" : destCountry === "US" ? "UPS® Ground (Standard)" : "UPS® Worldwide (Standard)",
          deliveryTime: t.upsFallback,
          ...m,
          amount: Number(m.price),
          carrier: "ups",
          meta: { origin, upsSource: "fallback" },
        },
      ]
    }
    const out: ShippingOption[] = []
    for (const rate of shipments) {
      const srvCode = rate.serviceCode
      const friendlyName = UPS_SERVICE_NAMES[srvCode] ?? "Standard Shipping"
      let finalPrice = rate.monetaryValue
      let finalTitle = `UPS® ${friendlyName}`
      let usd = Number(rate.monetaryValue)
      let source: "live" | "free" = "live"
      let deliveryTime = t.upsUs
      if (isCA) {
        deliveryTime = t.upsCanada
        if (freeBasisSubtotal >= threshold && srvCode === "11") {
          finalPrice = "0.00"
          usd = 0
          source = "free"
          finalTitle = `UPS® Standard to Canada (Free Shipping Over $${formatUsdThreshold(threshold)})`
        }
      } else if (destCountry === "US") {
        if (freeBasisSubtotal >= threshold && srvCode === "03") {
          finalPrice = "0.00"
          usd = 0
          source = "free"
          finalTitle = `UPS® Ground (Free Shipping Over $${formatUsdThreshold(threshold)})`
        }
      }
      const m = await money(usd, finalPrice, rate.currency)
      out.push({
        code: `ups-${srvCode}`,
        title: finalTitle,
        deliveryTime,
        ...m,
        amount: Number(m.price),
        carrier: "ups",
        meta: { origin, upsSource: source },
      })
    }
    return out
  }

  /** Legacy getCheapestUpsRate: Ground/Standard-to-Canada if present, else the cheapest; fallback on error. */
  async function getCheapestUpsRate(subtotalForFree: number, allowFree: boolean): Promise<number> {
    if (allowFree && subtotalForFree >= threshold) return 0
    try {
      const shipments = await adapters.ups.shop(buildUpsRequest())
      const standard = shipments.find((s) => s.serviceCode === "03" || s.serviceCode === "11")
      if (standard) return Number(standard.monetaryValue)
      const cheapest = [...shipments].sort((a, b) => Number(a.monetaryValue) - Number(b.monetaryValue))[0]
      if (!cheapest) throw new Error("Invalid UPS response")
      return Number(cheapest.monetaryValue)
    } catch {
      return upsFallbackUsd()
    }
  }

  // ==========================================
  // SCENARIO A: US ITEMS ONLY TO UPS TERRITORY
  // ==========================================
  if (hasUSItems && !hasNigeriaItems) {
    if (isUpsException) return { options: await getFullUpsRates(), origin, defaultedWeightLineIds }
    if (destCountry === "MX" && settings.gapFixes.usOnlyToMexico) {
      return { options: await getFullUpsRates(), origin, defaultedWeightLineIds }
    }
    if (!isNorthAmerica && settings.gapFixes.restOfWorld) {
      return { options: await getFullUpsRates(), origin, defaultedWeightLineIds }
    }
  }

  // ==========================================
  // SCENARIO B: NIGERIA OR MIXED CARTS (and US-only to mainland US)
  // ==========================================
  const options: ShippingOption[] = []
  const flatStandardFee = freeBasisSubtotal >= threshold ? 0 : settings.standardFeeUsd

  let liveUpsExceptionFee = 0
  if (isUpsException && hasUSItems && hasNigeriaItems) {
    liveUpsExceptionFee = await getCheapestUpsRate(freeBasisSubtotal, true)
  }

  // --- RULE 1: STANDARD SHIPPING (US and Canada only) ---
  if (destCountry === "US" || destCountry === "CA") {
    let totalStandardFee: number
    let standardTitle: string
    if (isUpsException && hasUSItems && hasNigeriaItems) {
      totalStandardFee = liveUpsExceptionFee + flatStandardFee
      standardTitle = `Standard Delivery (${mixedStdTimeline})`
    } else if (hasUSItems && hasNigeriaItems) {
      totalStandardFee = flatStandardFee
      standardTitle = `Standard Delivery (${mixedStdTimeline})`
    } else if (hasUSItems) {
      totalStandardFee = flatStandardFee
      standardTitle = `Standard Delivery - Shipping from US (${usStdDays})`
    } else {
      totalStandardFee = flatStandardFee
      standardTitle = `Standard Delivery - Shipping from Nigeria (${ngStdDays})`
    }
    const m = await money(totalStandardFee, totalStandardFee.toFixed(2), checkoutCurrency)
    options.push({
      code: "standard_rate",
      title: standardTitle,
      deliveryTime: standardTitle,
      ...m,
      amount: Number(m.price),
      carrier: "haanta",
      meta: { origin },
    })
  }

  // --- RULE 2: DHL EXPEDITED SHIPPING (FEZ) ---
  const expeditedDestination = isNorthAmerica || settings.gapFixes.restOfWorld
  if (hasNigeriaItems && expeditedDestination) {
    let fezNgn = getFezBasePriceNgn(nigeriaWeight, settings)
    if (settings.applyDropOffFee) fezNgn += settings.dropOffFeeNgn
    let discountedNaira = fezNgn - settings.fezSubsidyNgn
    if (discountedNaira < 0) discountedNaira = 0
    const ngnPerUsd = await getNgnPerUsd(adapters.fx, settings)
    let totalExpeditedFee = discountedNaira / ngnPerUsd
    let expeditedTitle = `DHL Expedited Shipping - Shipping from Nigeria (${ngExpDays})`
    if (hasUSItems) {
      expeditedTitle = `DHL Expedited Shipping (${mixedExpTimeline})`
      // Gap fix: outside North America the Houston items need their own UPS leg.
      if (!isNorthAmerica) totalExpeditedFee += await getCheapestUpsRate(0, false)
    }
    const m = await money(totalExpeditedFee, totalExpeditedFee.toFixed(2), checkoutCurrency)
    options.push({
      code: "expedited_rate",
      title: expeditedTitle,
      deliveryTime: expeditedTitle,
      ...m,
      amount: Number(m.price),
      carrier: "dhl",
      meta: { origin, fezNgn, ngnPerUsd },
    })
  }

  return { options, origin, defaultedWeightLineIds }
}
