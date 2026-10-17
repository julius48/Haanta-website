import type { UpsRatedShipment, UpsRatingAdapter } from "../types"

/**
 * Deterministic local UPS stand-in used when UPS credentials are absent (dev, CI, e2e).
 * Prices scale with total package weight so different carts give different, repeatable rates.
 */
export function createMockUpsAdapter(): UpsRatingAdapter {
  return {
    async shop(request) {
      const lbs = request.packages.reduce((s, p) => s + p.weightLbs, 0)
      const money = (n: number) => n.toFixed(2)
      const country = request.destination.country.toUpperCase()
      const rows: UpsRatedShipment[] =
        country === "US"
          ? [
              { serviceCode: "03", monetaryValue: money(18 + lbs * 1.5), currency: "USD" },
              { serviceCode: "02", monetaryValue: money(35 + lbs * 3), currency: "USD" },
              { serviceCode: "01", monetaryValue: money(60 + lbs * 4.5), currency: "USD" },
            ]
          : [
              { serviceCode: "11", monetaryValue: money(28 + lbs * 2), currency: "USD" },
              { serviceCode: "08", monetaryValue: money(55 + lbs * 3.5), currency: "USD" },
              { serviceCode: "07", monetaryValue: money(80 + lbs * 4.5), currency: "USD" },
            ]
      return rows
    },
  }
}
